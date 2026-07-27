# Local Deterministic Testing

This runbook defines the non-live testing lane for checks that should not depend on a reachable Supabase project, a stable live database, or production-like network state.

## Goal

Move unstable test surfaces out of the real environment by default:

- Use MSW for frontend/page data that only needs API shape and deterministic UI states.
- Use local API/contract tests for request/response mapping and error boundaries.
- Use an ephemeral Postgres service container for backend tests that need SQL behavior.
- Keep RLS, real migrations, live concurrency, production auth, storage, and rollback evidence in `live_only` or `db_dependent` gates.

## Entry Points

```powershell
node project-testing/tools/check-local-deterministic-readiness.mjs --output project-testing/reports/local-deterministic-readiness.json
node project-testing/tools/run-release-dashboard.mjs --profile local-deterministic --dry-run
```

The readiness checker is read-only. It confirms that the repo has the minimum wiring for deterministic testing: client MSW package and handlers, server `DB_CONNECTION_STRING` override, server boot validation switch, and the GitHub Actions Postgres service-container template.

## Classification

Use these tiers when moving gates out of real environment blocking:

- `local_browser_msw`: frontend or browser behavior backed by MSW fixtures; can prove rendering, empty/error states, permissions display, and client-side workflow branching.
- `local_api_contract`: API route and client-service contract tests that do not require live Supabase state.
- `container_db`: backend integration tests against an ephemeral Postgres database with explicit migration/seed setup.
- `live_only`: real Supabase auth, RLS, storage, workspace isolation, production-like concurrency, query-log evidence, and rollback evidence.
- `db_dependent`: migration governance, schema drift, Supabase Advisor, and database recovery gates.

## Boundaries

MSW evidence cannot close live readiness. It can only prove deterministic UI behavior for the mocked API contract.

Container DB evidence cannot close Supabase-specific readiness by itself. It can prove SQL integration logic, transaction behavior, and migration compatibility against the selected ephemeral schema.

`SKIP_DATABASE_VALIDATE=true` is only a local boot aid. It must not be counted as a database-readiness pass.

The GitHub Actions service-container template under `project-testing/plugins/` is not active CI. Promote it to `.github/workflows` only after the selected tests, migration command, and artifact retention policy are reviewed.

## Recommended Migration Order

1. Run the readiness checker and keep the JSON report under `project-testing/reports/`.
2. Pick one flaky frontend/browser gate and replace live data dependency with MSW fixtures.
3. Convert that gate into a repeatable Vitest or Playwright script and classify it as `local_browser_msw`.
4. Pick one backend route/service that currently needs real Supabase only for basic SQL behavior; move it to a Postgres service-container gate.
5. Leave true live gates blocked until explicit handoff and evidence rules are satisfied.

## Current First Gate

`msw-deterministic-page-data` currently runs:

```powershell
npm exec --workspace=client -- vitest run src/pages/__tests__/CompanyCockpit.msw.test.tsx
```

This test renders the CompanyCockpit page with the real `DashboardApiService.getCompanySummary` request path backed by MSW. It proves deterministic page rendering against the mocked summary contract only; it does not prove live Supabase, RLS, storage, or production readiness.
