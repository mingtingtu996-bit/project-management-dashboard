# WorkBuddy Data Governance Center

This folder is the repository-local data governance center for WorkBuddy. It is governance-as-code, not product runtime code.

## Boundary

`project-data/` governs data contracts, table ownership, writer registration, mutation boundaries, lineage, and data-quality checks. It does not replace application code, migrations, release tests, search evidence, or production databases.

All tools in this center are read-only by default. Real staging/live/prod data writes must remain behind the existing testing and handoff gates.

## Folder Map

- `skills/workbuddy-data-governance/`: project-local data governance skill. Read it before changing data contracts, writer registry, data boundaries, or data quality rules.
- `catalog/`: table, column, service, and metric catalog entries.
- `contracts/`: table, runtime-writer, and candidate-asset contracts.
- `boundaries/`: environment and mutation boundaries, forbidden writes, and candidate-to-runtime gates.
- `lineage/`: writer registry, migration ledger, runtime publication lineage, and external knowledge flow.
- `quality/`: data quality rule inventory plus Soda and Data Contract CLI templates.
- `plugins/mcp-config/`: MCP configuration templates. Do not write tokens or database URLs into committed files.
- `plugins/mcp-servers/`: locally installed npm MCP packages for Supabase MCP and MCP Toolbox.
- `plugins/python-tools/`: pinned Python CLI requirements for datacontract and Soda.
- `tools/`: local center checks and plugin installation helpers.
- `reports/`: generated data governance reports.

## Recommended Tools

- Supabase MCP: project-scoped, read-only Supabase metadata and SQL exploration.
- MCP Toolbox for Databases: controlled database MCP layer for PostgreSQL and other data stores.
- Data Contract CLI: data contracts, schema compatibility, and quality checks.
- Soda Core: YAML data-quality scans.

The MCP templates are intentionally non-runnable until environment variables are supplied outside the repository.

## Commands

Install or refresh npm MCP plugins:

```powershell
node project-data/tools/ensure-data-governance-plugins.mjs
```

Check the center:

```powershell
node project-data/tools/check-data-center.mjs
node project-data/tools/check-data-boundaries.mjs
node project-data/tools/check-writer-registry.mjs
node project-data/tools/check-data-contracts.mjs
```

Run the full center test:

```powershell
node --test project-data/tools/data-center.test.mjs
```

Build and run the read-only DB audit package:

```powershell
npm run data:readonly-audit-package -- --output-dir project-data/reports/readonly-db-audit-package
npm run data:readonly-audit-run -- --output-dir project-data/reports/readonly-db-audit-run
```

Use `--dry-run` on `data:readonly-audit-run` to validate the audit plan without connecting to a database.

## Current Scope

The first version focuses on:

- core table catalog
- forbidden write boundaries
- writer registry
- candidate-to-runtime gates
- BI metric source-of-truth boundaries
- plugin/tool inventory

It does not create new production data flows.
