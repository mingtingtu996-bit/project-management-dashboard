# v1.4.23.1 Post-278 Production Migration Governance Closeout - 2026-07-04

## Scope

This report records the post-278 production migration-governance closeout for Supabase project `wwdrkjnbvcbfytwnnyvs`. It is the current production evidence for opening the migration-governance-controlled scheduler and read-model warmup gates. It does not authorize old-object physical drops, runtime publication apply, or unrelated release gates.

## Production Evidence

- Evidence input: `project-testing/reports/production-migration-governance/evidence.post278.production.with-advisor-export.json`
- Formal Advisor export: `project-testing/reports/production-migration-governance/supabase-advisor-management-api-export.post278.production-wwdrkjnbvcbfytwnnyvs.json`
- Advisor export source: `management_api`
- Advisor export environment: `production`
- Advisor security issues: `0`
- Advisor performance issues: `1136`
- `public.schema_migrations` closeout readback: `295`
- `keyCatalogMatches=true`
- `advisorPass=true`
- `allowValidate=true`
- `allowWarmup=true`
- `allowScheduler=true`

## Governance Result

Command:

```powershell
npm.cmd run migrate:production-governance --workspace=server -- --evidence-file ../project-testing/reports/production-migration-governance/evidence.post278.production.with-advisor-export.json
```

Result:

- `status=closed`
- `MG-01` through `MG-07` all `pass`
- `MG-07 closeout_readback=pass`
- `MG-07 reasonCodes=[]`
- `allowValidate=true`
- `allowWarmup=true`
- `allowScheduler=true`

## Runtime Switch

Production Docker Compose now mounts the production migration-governance evidence directory read-only into the API container and points `PRODUCTION_MIGRATION_GOVERNANCE_EVIDENCE` at:

```text
/app/runtime-evidence/production-migration-governance/evidence.post278.production.with-advisor-export.json
```

The production scheduler and read-model warmup skip flags are explicitly set to `false`. The server bootstrap still fails closed if the mounted evidence is missing, stale, not `status=closed`, or does not permit `allowScheduler / allowWarmup`.

## Performance Boundary

`performanceIssueCount=1136` is not an MG-07 closeout blocker in `migrationProductionGovernanceService`; MG-07 is closed by the formal Advisor UI/API export with `securityIssueCount=0` and the production closeout readback. Performance remains an independent v1.4.24 PB-08 / G6 requirement covering browser/API performance, pressure, query log, and slow-query governance.
