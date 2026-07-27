# Testing Tooling Notes

These notes record recommended testing integrations. They are not active installation instructions for the current live-testing window.

The authoritative Phase 4 inventory is `testing-tool-inventory.json`. Run the read-only check with:

```powershell
node project-testing/tools/check-testing-tools.mjs --output project-testing/reports/tool-readiness-summary.json
```

## Already Present Or Locally Suitable

- Playwright: existing browser scripts and UIUX gates already use it.
- `@axe-core/playwright`: already present at the repository root for accessibility checks.
- MSW: already present in the client package and suitable for `local_browser_msw` gates.
- Playwright MCP: useful for exploratory browser control and converting findings into repeatable scripts.
- CloakBrowser: reusable browser binary exists outside the repo and can be wired through `CLOAK_BROWSER_EXECUTABLE`.
- Yingdao RPA: useful for manual-assisted UAT replay and cross-desktop/browser/file workflows; evidence must be labeled manual-assisted.

## Tool Layers

- Browser runtime: CloakBrowser.
- Repeatable automation: Playwright scripts, Vitest, existing npm verify commands.
- Deterministic frontend data: MSW.
- CI ephemeral database: GitHub Actions PostgreSQL service container template in `github-actions-postgres-service-container.example.yml`.
- Manual-assisted UAT: Yingdao RPA.
- Exploratory browser control: Playwright MCP.
- Future specialized gates: Schemathesis, Testcontainers PostgreSQL, Argos/Lost Pixel, k6/Artillery, ZAP baseline.

## Future Additions

- GitHub Actions service containers: promote the example workflow only after a selected container DB test slice, migration/seed command, and artifact retention policy are reviewed.
- Testcontainers PostgreSQL: add only if local Docker and disk capacity are acceptable; prefer GitHub Actions service containers first on this machine.
- Schemathesis: add only after an authoritative OpenAPI artifact exists.
- Argos or Lost Pixel: add only if visual diffs need a PR review UI.
- Artillery or k6: add after critical API flows and performance budgets are stable.

## Boundary

Do not add dependencies or modify CI while another live-testing thread is active. Use this file and `testing-tool-inventory.json` to plan tool adoption, not to declare a future tool active.

GitHub and Supabase plugins are useful for later CI and live evidence handoff work. They do not change the deterministic local boundary: mocked, contract, and container evidence must not be counted as Supabase live readiness.
