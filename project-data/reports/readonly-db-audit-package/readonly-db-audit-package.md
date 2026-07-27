# WorkBuddy Read-Only DB Audit Package

- Schema: `workbuddy-readonly-db-audit-package/v1`
- Mutation boundary: `readonly_db_audit_package_only_no_db_connection_no_db_mutation`
- Tables in catalog: 16
- Table contracts: 10
- Quality checks: 32

## Commands

```powershell
npm run data:readonly-preflight
npm run data:readonly-audit-package -- --output-dir project-data/reports/readonly-db-audit-package
```

## Required Environment

- `SUPABASE_ACCESS_TOKEN`
- `WORKBUDDY_SUPABASE_PROJECT_REF`
- `WORKBUDDY_PG_HOST`
- `WORKBUDDY_PG_PORT`
- `WORKBUDDY_PG_DATABASE`
- `WORKBUDDY_PG_USER`
- `WORKBUDDY_PG_PASSWORD`

## SQL Files

- `readonly-db-audit.sql`: schema inventory, table presence, column presence, and read-only quality checks.

No SQL in this package mutates database state.
