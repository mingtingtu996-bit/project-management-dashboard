# Duration Learning Runtime Evidence Outbox Recovery

## Normal Recovery

The primary recovery path is the automatic five-minute persistent schedule. Restarting the server worker restores the timer and its persisted catch-up slot. Confirm the job is scheduled in `GET /api/jobs/status` before considering a manual drain.

No HTTP manual-execution endpoint exists for this cross-tenant job. Company administrators, including users carrying the legacy `users.global_role=company_admin` value, are not platform operators and cannot trigger it through `/api/jobs`.

## Controlled CLI Recovery

Use the CLI only from a controlled server shell or a GitHub Environment runner whose deployment identity already has access to the selected runtime database. Do not introduce an application user, company membership, request header, or ad hoc service token as an operator substitute.

Before execution:

1. Confirm the checked-out commit is the exact release SHA deployed to the target environment.
2. Confirm the target is explicitly staging or production and load only that environment's secrets.
3. Resolve and record the expected Supabase project reference, effective database host, and runtime database role before any write.
4. Confirm the ordinary five-minute schedule and worker restart/catch-up path cannot recover the backlog in time.
5. Keep staging and production executions separate. Never reuse a local `.env` as deployment evidence.

Run from the repository root:

```powershell
npm run recover:duration-learning-runtime-evidence-outbox --workspace=server -- --allow-write --confirm DRAIN_DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_NOW
```

The command loads the job and database graph only after both confirmation arguments pass. A lease-contention or local-overlap `skipped` result exits as a failure; wait for the active worker or investigate the lease instead of reporting recovery success.

After execution, read `/api/jobs/status` and the target database backlog metrics from the same environment. Record the target, immutable SHA, command exit code, and sanitized result. Do not store credentials or connection strings in logs or artifacts.

Local output proves only that the CLI ran locally. It does not prove deployment, migration application, staging recovery, production recovery, or live duration-learning consumption.
