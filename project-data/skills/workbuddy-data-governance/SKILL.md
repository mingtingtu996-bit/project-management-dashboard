---
name: workbuddy-data-governance
description: Governed data catalog, table contracts, writer registration, mutation boundaries, migration lineage, runtime publication, Supabase MCP, Data Contract CLI, and Soda Core workflow for this WorkBuddy repository.
---

# WorkBuddy Data Governance

Use this skill before changing `project-data/`, data contracts, writer registries, mutation boundaries, data quality rules, or MCP/plugin configuration for data access.

## Workflow

1. Keep all data-governance artifacts under `project-data/`.
2. Classify the task:
   - Table/source-of-truth inventory: update `catalog/`.
   - Writer or staging/live write path: update `lineage/writers.json` and `boundaries/`.
   - External knowledge calibration: keep it repository-local and update `boundaries/candidate-to-runtime-gates.json` only as a no-runtime compatibility boundary.
   - Table/schema/data quality rule: update `contracts/` and `quality/`.
   - MCP or CLI tooling: update `plugins/` and run `tools/ensure-data-governance-plugins.mjs`.
3. Treat all MCP/database access as read-only unless a separate testing handoff explicitly authorizes a write path.
4. Do not place access tokens, database URLs, service-role keys, passwords, or production project refs in committed files.
5. Run center checks after changes:

```powershell
node project-data/tools/check-data-center.mjs
node project-data/tools/check-data-boundaries.mjs
node project-data/tools/check-writer-registry.mjs
node project-data/tools/check-data-contracts.mjs
```

## Hard Boundaries

External search, public project data, and knowledge-base material may not directly write:

- `tasks`
- `task_baselines`
- `monthly_plans`
- `monthly_plan_items`
- `task_dependencies`
- `duration_experience_samples`
- `actual_duration_outcomes`
- `critical_path`
- published runtime overlays
- production seed rows

External candidate material never enters product tables. Accepted findings become official seed/rule/template source changes through code-owner review, automated tests, and normal release. Runtime learning is separate and uses real product facts and outcomes.

## MCP Rules

- Supabase MCP must be configured with `--read-only` and `--project-ref`.
- MCP Toolbox must use environment variables and must not embed database credentials in committed YAML/JSON.
- Production targets are disallowed in templates.
- All DB MCP usage is exploratory/read-only unless a separate governed handoff unlocks a write path.

## Output Contract

Every data-governance artifact should state:

- owner or steward
- environment boundary
- allowed writers/readers
- source-of-truth service or table
- mutation boundary
- validation command or review gate
