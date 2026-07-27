# Deletion Retention Governance

## Scope

Deletion, close, and archive protection is the dangerous-action governance layer for WorkBuddy. It prevents ordinary delete actions from breaking construction history, baselines, monthly plans, escalation chains, notification traces, and data lineage.

## Unified Dangerous Action

All dangerous actions should enter through `deletionRetentionGovernanceService` before a route performs physical deletion or lifecycle mutation.

Supported requested actions:

- `delete`
- `close`
- `archive`
- `deactivate`
- `void`
- `hide`
- `cancel`
- `restore`
- `overwrite`

The service resolves them to one of:

- `physical_delete`
- `soft_delete`
- `close`
- `archive`
- `deactivate`
- `void`
- `hide`
- `source_deleted`
- `replace_draft_row`
- `merge_into_existing`
- `supersede`
- `reject`

Routes can use `runRetentionGovernedAction` for a single public action envelope, or the lower-level `executeRetention` / `enforceRetentionOrBlock` helpers when they need existing response compatibility.
Blocked route responses must use `buildRetentionBlockedApiError` and `buildRetentionBlockedHttpStatus`. That keeps `RETENTION_CONFIRMATION_REQUIRED` / HTTP `409` and `RETENTION_REJECTED` / HTTP `422` aligned across risk, issue, project, acceptance, material, drawing, certificate, and task-adjacent routes.

## Coverage Matrix

`getRetentionCoverageMatrix` is the source of truth for which entity types are covered and how delete, close, archive, and source-deleted semantics behave.

Initial coverage includes:

- `task`
- `risk`
- `issue`
- `acceptance_plan`
- `task_obstacle`
- `notification`
- `project`
- `project_material`
- `construction_drawing`
- `certificate_work_item`

The matrix lists reference checks, primary consumers, whether confirmation is supported, and the source-deleted policy for each entity type. New routes and algorithm/seed generated records should be added to this matrix before exposing destructive actions.

## Executor Registry

`getRetentionExecutorRegistry` describes which entity types have confirmed-action executors. The registry keeps confirmation behavior explicit instead of hiding it inside route-specific branches.

Current executor coverage:

- `task`: close through `closeTaskInMainChain`
- `risk`: update lifecycle to `closed`
- `issue`: update lifecycle to `closed`
- `task_obstacle`: update lifecycle to resolved
- `acceptance_plan`: update lifecycle to archived
- `project`: update lifecycle to archived
- `project_material`: update `record_status=inactive` and `lifecycle_status=archived`
- `construction_drawing`: update status to archived
- `certificate_work_item`: update status to voided

If an entity type is `supportsConfirmation=true` in the coverage matrix, it must also have an executor registry entry before the UI is allowed to confirm a retention decision. Confirmed executors must use retained lifecycle mutations, not physical deletes.

Executor entries also expose operational capability flags:

- `idempotent`: whether a recovered confirmation can safely retry the retained lifecycle mutation.
- `transactionMode`: current execution boundary (`single_table_update`, `service_call`, or planned transaction boundary).
- `transactionReady`: whether the executor can already accept a shared transaction client.
- `dryRunSupported`: whether the executor can preview the mutation without applying it.

These flags let diagnostics distinguish "covered" from "ready for stronger transactional execution".

`POST /api/deletion-retention/preview` exposes executor dry-run output for project editors. It returns `previewOnly=true`, `applied=false`, executor capability metadata, the planned lifecycle mutations, and the transaction boundary summary. It never updates the domain row or the retention event. This endpoint is for confirmation UI, support tooling, and contract tests that need to inspect what a confirmed action would do before the user confirms it.

## Confirmation Hardening

Manual confirmation is a two-step guarded workflow:

- `executeRetention` returns the raw `decisionToken` only once to the caller.
- The event row stores `decision_token_hash` with `token_hash_version = sha256`; plaintext `decision_token` is backfilled to a hash, cleared, and removed from the schema by the hardening migration.
- `decisionToken` confirmation is bound to the original `actor_id`; another editor in the same project cannot confirm a token they did not create.
- `confirmRetentionDecision` first looks up by token hash, re-evaluates references, then reserves the row by moving `execution_status` from `pending_confirmation` to `confirming`.
- If a process stops after reservation but before final audit update, a later confirm can recover the `confirming` row, re-run the retained lifecycle action, and record `recovered_from_confirming`.
- Fresh `confirming` rows are treated as in-flight and return `RETENTION_DECISION_CONFIRMING`; recovery is only allowed after the reservation has been stale for 10 minutes.
- Stale `confirming` rows can recover up to three times. After that, the row moves to `failed` with `last_error_code=RETENTION_DECISION_RECOVERY_LIMIT_EXCEEDED`.
- If the retained lifecycle executor throws, the event moves to `failed` and `confirmation_metadata` records `last_error_code=CONFIRMED_RETENTION_ACTION_FAILED`, `last_error_message`, `failed_at`, and `recovery_attempts`.
- Confirmed action execution writes `confirmed_action_result`, `confirmation_metadata`, `confirmed_by`, `confirmed_at`, and `executed_at`.
- A repeated confirm on an already executed token returns idempotent success with the stored action result instead of re-running the lifecycle mutation.
- If references, resolved action, or execution mode changed, the pending event is expired and the user must refresh and start a new decision.

Migration `171_v1415_retention_confirmation_hardening.sql` adds `decision_token_hash`, `token_hash_version`, `confirmed_action_result`, `confirmation_metadata`, `expired_at`, backfills hashes from legacy plaintext tokens, clears and drops `decision_token`, and indexes token-hash lookup and pending expiry cleanup.

`createRetentionConfirmationTransactionPlan` documents the future atomic boundary for DB-backed executors: reserve the decision event, execute the domain lifecycle action, and persist confirmation audit together once an executor can accept a transaction client.

`createRetentionConfirmationTransactionBoundary` is the concrete boundary interface used by preview and diagnostics. It returns the planned steps, whether the executor is registered, the executor `transactionMode`, `transactionReady`, `requiresTransactionClient=true`, and `canExecuteAtomically`. Today the boundary is intentionally reported as not atomically executable because the current Supabase client path does not pass a shared transaction client through every domain executor. Future strong-transaction work should replace this boundary with an executor that receives one transaction context for reservation, mutation, and audit persistence.

`executeRetentionConfirmationTransactionBoundary` is the execution seam for that future work. When no transaction client is supplied, it returns `executedAtomically=false` with `skippedReason=transaction_client_required`. When a transaction client is supplied, it calls `reserveDecisionEvent`, `executeDomainLifecycleAction`, and `persistConfirmationAudit` through the same client and returns `executedAtomically=true`. Production confirmation still uses the existing Supabase path until every domain executor can accept the shared client.

`deletionRetentionCleanupJob` runs daily at 03:45 and calls `expirePendingRetentionDecisions` to mark stale `pending_confirmation` rows as `expired`.

## Pending Manual Close

`pending_manual_close` is a domain workflow state for risk and issue records. It means the upstream source has been resolved or disappeared, but a human owner must decide whether to close the downstream risk/issue or keep processing.

It is related to retention, but not identical:

- retention confirmation protects dangerous user actions such as delete;
- pending manual close protects domain lifecycle closure after source changes.

RiskManagement consumes both. It displays the pending manual close filter and calls the confirm-close endpoints for domain closure, while delete confirmation uses `/api/deletion-retention/confirm`.

## Source Deleted

When an upstream source disappears, downstream chains must not be physically erased. The source-deleted policy marks downstream warning/risk/issue/data-quality state so the system can explain why the record is stale and whether manual close is needed.

Expected behavior:

- warnings become resolved with `resolved_source = source_deleted`;
- risks/issues are marked with source-deleted metadata or `pending_manual_close` depending on the source transition;
- data-quality findings can resolve as `source_deleted`;
- notification reconciliation can resolve stale touchpoints without mutating source facts.

## Diagnostics Endpoint

`GET /api/deletion-retention/diagnostics` returns the management-side view of the protection layer. It is restricted to company administrators because it exposes route coverage, executor capability, and operational failure metadata. The route resolves the current company context and passes the caller's visible project ids into the service. Loaded event rows are filtered by `project_id`, and injected/manual diagnostics rows are filtered the same way, so company admins only see events for the current company / visible project scope.

Response sections:

- `summary`: total events, pending confirmations, confirming events, stale confirming events, rejected events, executed events, failed events, expired tokens, and missing executor count.
- `summary.routeCoverageGapCount`: routes that are expected to use retention governance but are missing a guard marker.
- `summary.unifiedErrorResponseGapCount`: guarded routes that do not use the shared error builder.
- `summary.frontendConsumerGapCount`: expected frontend consumers that do not use the shared retention error/confirm contract.
- `byEntityType`: event counts by entity type.
- `byReasonCode`: most common protection reasons.
- `byResolvedAction`: how often actions resolve to close, archive, soft delete, reject, and physical delete.
- `gaps`: governance gaps such as `missingExecutorEntityTypes`, `routeCoverageGaps`, `unifiedErrorResponseRouteGaps`, and `frontendConsumerGaps`.
- `operatorAttention`: stale `confirming` and `failed` events that need recovery or manual handling.
- `coverage`: coverage matrix.
- `executorRegistry`: confirmed-action executor coverage plus idempotency, transaction, and dry-run capability summary.
- `scope`: company id, whether diagnostics were visible project scoped, and how many project ids were applied.

The endpoint is for governance and operations. Product pages should still consume their regular domain APIs and only surface retention errors when an action is blocked or requires confirmation.

## Operator Attention API

`operatorAttention` rows are stale `confirming` events and failed confirmation executions that need operations follow-up. Company administrators can close the loop through `POST /api/deletion-retention/operator-actions`:

- `mark_handled`: marks the event as `cancelled_by_user` and writes `operator_status=handled` metadata. This removes the item from the active operator attention queue without re-running any domain mutation.
- `retry_requested`: records `operator_status=retry_requested` metadata while keeping the event failed for explicit follow-up; retry execution remains a deliberate confirmation/recovery path, not an automatic background mutation.

Both actions require `projectId`, `eventId`, and a supported action, and record the operator actor, note, and action timestamp in `confirmation_metadata`.

Operator actions are allowed only for active attention states: `failed` or stale `confirming`. Already `executed`, `expired`, `pending_confirmation`, and other terminal/non-attention statuses are rejected with `RETENTION_OPERATOR_ACTION_NOT_ATTENTION_STATUS`. Operator updates merge into the existing `confirmation_metadata` so prior `last_error_*`, `recovery_attempts`, reservation, and failure context remain available after the operations closeout.

## Data Quality Feed

Retention governance contributes silent backend data-quality findings:

- `RETENTION_DECISION_EXPIRED`: pending confirmation expired before user action.
- `RETENTION_CONFIRMING_STALE`: confirmation stayed in `confirming` beyond the recovery window.
- `RETENTION_CONFIRMATION_FAILED`: confirmation executor failed or exceeded recovery limits.

These findings remain visible in data quality summaries and diagnostics, but their owner digest policy is `silent` to avoid noisy user notifications for backend governance repair work.

## Frontend Contract

Frontend pages should use `retentionError.ts` instead of parsing raw API errors locally. Gantt, RiskManagement, and Materials consume the same confirmation model and `/api/deletion-retention/confirm` endpoint. Shared helpers provide:

- `parseRetentionApiError`
- `isRetentionConfirmationError`
- `getRetentionDecisionTokenFromError`
- `buildRetentionDecisionDialogModel`
- `buildRetentionDecisionPayload`
- `getRetentionApiUserMessage`

This keeps Gantt, RiskManagement, materials, drawings, certificates, and future pages on one confirmation/error display contract. RiskManagement consumes the shared dialog model for risk/issue delete confirmation; Gantt consumes the same model for task/obstacle delete guards. Expired or stale confirmation tokens use the shared message: "保留处置凭证已过期或引用关系已变化，请刷新后重新发起操作。"
