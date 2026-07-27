# v1.4.23.1 C-18.L09 checksum reconciliation - 2026-06-22

## Purpose

During the C-18.L09 live wizard commit probe, the forward-only migration
`236_v14231_task_creation_side_effect_runtime_rls_policies.sql` was required to
fix runtime RLS policies for task creation side-effect tables.

Before applying that migration, the migration safety gate blocked on one
unreconciled historical checksum mismatch:

| Migration | Version | Current file checksum | Live ledger checksum | Resolution |
| --- | --- | --- | --- | --- |
| `214_v14225_recommendation_actions.sql` | `214` | `25fe38942a3c044a67fe01dacfeb2ee2a16781a05486082197d7faa4e4c537ac` | `53469e66a51d287a7fc026169310508288ef8db106aff4a898a440ab2a66df02` | Reconciled by hash-bound registry; ledger unchanged. |

## Guardrail

This reconciliation does not rewrite `public.schema_migrations` and does not
allow silent future migration edits. The safety gate will block again if either
the current file checksum or the live ledger checksum changes.
