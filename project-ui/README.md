# WorkBuddy UI Implementation Center

`project-ui/` coordinates UI implementation rules, design inputs, release verification routing, and generated UI evidence.

## Entry Points

- Rules: `project-ui/skills/workbuddy-ui-implementation/SKILL.md`
- Matrix: `project-ui/matrix/ui-implementation-matrix.json`
- Tool inventory: `project-ui/plugins/ui-tool-inventory.json`
- Source map: `project-ui/index/source-map.json`
- Move ledger: `project-ui/index/moved-files.json`
- Local check: `node project-ui/tools/check-ui-center.mjs`
- Dashboard preview: `node project-ui/tools/run-ui-dashboard.mjs --profile design-audit --dry-run`

## Operating Model

- Skills define UI rules and decision boundaries.
- Figma and browser collection provide candidate design context, not production truth.
- Local scripts govern matrices, reports, source maps, and moved artifacts.
- `project-testing/` remains the release cockpit for browser, accessibility, visual, performance, and predeploy verification.
- Generated UI evidence belongs under `project-ui/artifacts/` or `project-ui/reports/` and must not mutate production data.
- Authoritative plans, design-system files, and production code remain at their current paths until references and compatibility rules are updated.

## Common Profiles

- `design-audit`: read rules, source map, and design-system sources before UI edits.
- `figma-assets`: collect or replay approved design extraction outputs.
- `component-library`: inspect shared primitives, tokens, and component contracts.
- `page-implementation`: implement or refine a page under current capability and release guards.
- `uiux-verify`: route UI release verification through `project-testing`.
- `tool-readiness`: inspect available tools without treating configuration as pass evidence.
