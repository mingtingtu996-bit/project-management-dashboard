# v1.4.23.1 staging checksum reconciliation - 2026-07-15

## Scope

This audit covers four already-applied early reconciliation migrations whose current
files no longer match the staging ledger byte-for-byte. The review was read-only and
did not update the migration ledger or replay SQL.

The repository now stores managed migration SQL as byte-stable Git content so a
Windows worktree, clean archive, and Linux checkout cannot silently change checksums.

## 003a reconcile Phase 1 dashboard prerequisites

- Current file checksum: `efcb41551e025703dbc7d4a1c7e99259b3cca589af98c9d5e8a5a67544145191`
- Staging ledger checksum: `1923e0c994855798ead1220b806a618cb0f6445773f95e8fd4da8d6532492312`
- Catalog readback: all declared `projects` dashboard columns, task planned-date
  columns, and `task_conditions.status` are present.

## 006b reconcile Phase 1 RLS existing table columns

- Current file checksum: `e8d4c857512dd2dc9eef33085cc5ed297b195d548ef1b65dddf767c61c1fe7b2`
- Staging ledger checksum: `f05d90278849a37378354840e4fcd73549be0e968b012b581e4bc102235b1078`
- Catalog readback: `acceptance_nodes.plan_id`, `acceptance_nodes.created_by`, and
  `pre_milestone_conditions.created_by` exist with their expected foreign keys.
- `wbs_task_links` and `wbs_structure` are absent by design; ledgered migration 304
  retired both legacy objects. The current 006b compatibility SQL must not be replayed.

## 008a reconcile job execution logs Phase 1 columns

- Current file checksum: `8240ac53c1f1433f838d0ec84dd308e82637d8ad9e3fc14b384d6ecae38dc76b`
- Staging ledger checksum: `89b8295e4db0e4a534eef1efd1c6786b9e03afba98109a3938b623d447f3c70d`
- Catalog readback: `completed_at`, `result`, `job_id`, and `triggered_by` are present
  on `job_execution_logs`.

## 010a reconcile Phase 2 soft-delete columns

- Current file checksum: `c02df556b6b40527a650eacebeb00b937746c28ab96d2883b8364e38446886d3`
- Staging ledger checksum: `3d41413c00dbd6f3c25404b80819e1c5cee3e49eecd0c88a8f5fcf4add564cd6`
- Catalog readback: `projects.deleted_at` and `wbs_templates.deleted_at` are present.

## Decision

The four exact checksum pairs may be reconciled. Any future change to either a
checked-out migration file or the staging ledger checksum remains fail-closed.
