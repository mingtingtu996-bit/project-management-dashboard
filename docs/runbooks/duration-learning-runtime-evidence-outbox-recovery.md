# Duration Learning Runtime Evidence Outbox Recovery

## Normal Recovery

The primary recovery path is the automatic five-minute persistent schedule. Restarting the server worker restores the timer and its persisted catch-up slot. Confirm the job is scheduled in `GET /api/jobs/status` before considering a manual drain.

No HTTP manual-execution endpoint exists for this cross-tenant job. Company administrators, including users carrying the legacy `users.global_role=company_admin` value, are not platform operators and cannot trigger it through `/api/jobs`.

## Controlled CLI Recovery

Use the CLI only from a controlled server shell or a GitHub Environment runner whose deployment identity already has access to the selected runtime database. Do not introduce an application user, company membership, request header, or ad hoc service token as an operator substitute.

Before execution:

1. Confirm the checked-out commit is the exact release SHA deployed to the target environment.
2. Confirm the target is explicitly staging or production and load only that environment's secrets.
3. Resolve and record the expected Supabase project reference, effective database host, database name, and non-privileged runtime database role before any write.
4. Confirm the ordinary five-minute schedule and worker restart/catch-up path cannot recover the backlog in time.
5. Keep staging and production executions separate. Never reuse a local `.env` as deployment evidence.

Run from the repository root:

```powershell
npm run recover:duration-learning-runtime-evidence-outbox --workspace=server -- --allow-write --confirm DRAIN_DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_NOW --environment staging --expected-release-sha <40-char-deployed-sha> --expected-project-ref <20-char-supabase-ref> --expected-database-role workbuddy_runtime_login --expected-database postgres
```

Use `--environment production` only in the production release shell. `SUPABASE_URL` must use the runtime's canonical raw form `https://<20-char-ref>.supabase.co`, without surrounding whitespace or a trailing slash. The command compares every expected value with `DEPLOY_TARGET`, `RELEASE_SHA`, `SUPABASE_URL`, and the effective `DB_CONNECTION_STRING` or explicit `DB_*` connection authority. It permits only the matching Supabase direct or verified pooler host, exact project ref, database, and runtime role. Pure target checks run before the strict PostgreSQL parser is loaded, and the job/database graph loads only after the strict effective target also matches. A lease-contention or local-overlap `skipped` result exits as a failure; wait for the active worker or investigate the lease instead of reporting recovery success.

After execution, read `/api/jobs/status` and the target database backlog metrics from the same environment. Record the target, immutable SHA, command exit code, and sanitized result. Do not store credentials or connection strings in logs or artifacts.

Local output proves only that the CLI ran locally. It does not prove deployment, migration application, staging recovery, production recovery, or live duration-learning consumption.
