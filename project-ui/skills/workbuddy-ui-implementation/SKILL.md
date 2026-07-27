---
name: workbuddy-ui-implementation
description: Use when working on WorkBuddy UI implementation, design-system alignment, design assets, page polishing, UI/UX verification, or frontend tooling in this repository.
---

# WorkBuddy UI Implementation

Use `project-ui/` as the UI coordination center before making frontend UI changes.

## Workflow

1. Read `AGENTS.md` and this skill first.
2. Read `project-ui/matrix/ui-implementation-matrix.json` for profiles, commands, and boundaries.
3. Read `project-ui/index/source-map.json` before moving UI documents or treating them as authoritative.
4. Keep authoritative docs and code at their current paths unless the source map says a physical move is safe.
5. Put new UI reports in `project-ui/reports/` and generated UI or design evidence in `project-ui/artifacts/`.
6. Use `project-testing/` for release-grade browser, visual, accessibility, performance, and smoke verification.

## Boundaries

- Do not create a parallel UI test cockpit; route release verification through `project-testing/tools/run-release-dashboard.mjs`.
- Do not directly write production data from UI research, design extraction, screenshots, or visual audit output.
- Do not introduce visual tokens before checking `AGENTS.md`, the v1.3 UI/UX plans, and `design-system/workbuddy/MASTER.md`.
- Treat `docs/reports/uiux-295-release-evidence.md` as historical evidence unless its commands are rerun in the current release tree.
- Prefer existing React, Tailwind, Radix-style primitives, Lucide icons, and shared components.
- Backend capability gaps require an explicit backend handoff; UI text or prototypes must not fake completion.

## Profiles

| Situation | Profile |
| --- | --- |
| Understand UI rules or plan implementation | `design-audit` |
| Collect approved design extraction data | `figma-assets` |
| Work on shared primitives or tokens | `component-library` |
| Implement or refactor a page | `page-implementation` |
| Verify a UI release | `uiux-verify` |
| Inspect available tools | `tool-readiness` |

Run:

```powershell
node project-ui/tools/check-ui-center.mjs
node project-ui/tools/run-ui-dashboard.mjs --profile design-audit --dry-run
```
