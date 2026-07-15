# Notification Attention Governance

## Scope

The notification attention system has two layers:

- Write-time projection and dedupe: business services emit notifications through `notificationTouchpointService`, which normalizes lifecycle, touchpoint, scope, dedupe key, target route, and projection metadata.
- Read-time attention aggregation: `todoTouchpointService` reads active notifications and returns the summary consumed by Header, Sidebar, and notification-facing surfaces.

## Touchpoint Projection

Notification touchpoints are:

- `persistent`: notification center/bell style notification.
- `dashboard_todo`: actionable reminder that can contribute to notification today-todo.
- `popup`: immediate visual interruption.
- `page_banner`: contextual page-level banner.
- `system_record`: audit/system record; excluded from attention counts.

Intent projection:

- `system-exception` maps to `system_record` unless an explicit visual touchpoint is provided.
- `business-warning` and `flow-reminder` map to `dashboard_todo` unless an explicit visual touchpoint is provided.
- Unknown touchpoints fall back to `persistent`.

Every emit carries metadata:

- `projection_source = notification_touchpoint_service`
- `projection_rule_version = v1.4.13-attention-governance`
- `dedupe_strategy = explicit | source_entity | none`
- `dedupe_required = true` when a dedupe key is available
- `dedupe_missing = true` when an actionable touchpoint lacks a canonical dedupe key

The runtime registry is `NOTIFICATION_TOUCHPOINT_RULE_REGISTRY`. It owns the touchpoint contribution flags, dedupe index name, canonical dedupe-key parts, source, and rule version used by analytics and attention-summary aggregation. Write-time projection and read-time today-todo/attention counts must both derive touchpoint contribution behavior from this registry.

## Dedupe Contract

Active notification dedupe is keyed by company, project, scope, touchpoint, and `dedupe_key`. This prevents duplicate active touchpoints for the same projected business event while allowing separate touchpoints to exist when a product flow intentionally emits them.

High-value producers should always provide either:

- an explicit `dedupe_key`, or
- `source_entity_type` plus `source_entity_id`, allowing the touchpoint service to derive one.

If an insert races the unique index, `notificationTouchpointService` reloads the active dedupe row and patches it instead of creating a second row or surfacing a duplicate-key error.

Canonical derived key:

```text
company_id-or-no-company:project_id-or-no-project:source_entity_type:source_entity_id:type-or-notification
```

## Producer Closure Contract

`notificationTouchpointService.emit` applies `notificationProducerContract` before projection. The notification layer is now closed as infrastructure: it does not interpret seed or algorithm business semantics. Upstream producers must decide whether a signal is actionable before emitting it.

Producer policy:

- `candidate_only`, `candidate_gate`, `confidence_only`, `explain_only`, `observe_only`, `observation_only`, `shadow_only`, and `shadow_run` cannot create attention touchpoints. If a producer requests `dashboard_todo`, `persistent`, `popup`, or `page_banner` with one of those policies, the service downgrades the row to `notification_type = system-exception` and `touchpoint_type = system_record`.
- `owner_confirmation` remains actionable because a named owner decision is required; it may stay as `dashboard_todo`.
- Runtime/enforced producers may emit actionable touchpoints, but must still provide source identity or an explicit dedupe key.
- Seeds and algorithm candidates may provide evidence, rule version, source algorithm, and action intent in metadata; they must not bypass the producer contract to directly create user-facing todos.

Every emitted row carries producer contract metadata:

- `producer_contract_version = v1.4.13-producer-closure`
- `producer_action_policy`
- `producer_touchpoint_decision = allowed_actionable | allowed_non_actionable | downgraded_to_system_record`
- `producer_boundary_reason`

New algorithm or seed producers should be added by standardizing their output into this contract, not by adding special business branches to `notificationTouchpointService` or `todoTouchpointService`.

## Producer Audit

`notificationProducerAuditService` provides a static producer audit for service-side emit calls. It scans `notificationTouchpointService.emit({ ... })` call sites and reports missing governance fields before they become noisy user-facing touchpoints.

Audit checks:

- `source_identity`: producer should provide `source_entity_type` and `source_entity_id`.
- `dedupe_key`: producer should provide an explicit `dedupe_key`, or source identity so the touchpoint service can derive one.
- `target_route`: actionable rows should explain where the user can act.
- `action_due_at`: todo-like rows should provide a due hint when the source domain has one.

The audit is diagnostic. It does not mutate notifications or source facts; it gives maintainers a closure report for new algorithm, seed, and workflow producers.

## User State, Due Date, And Expiry Contract

Read-time attention and list projections are user-state-aware:

- `notification_user_states.is_hidden = true` removes the row from the current user's attention/list projection.
- Active mute removes the row while `is_muted = true` and `muted_until IS NULL OR muted_until > now()`.
- Read counts use `notification_user_states.is_read` first and fall back to `notifications.is_read` only when there is no user row.
- Expired rows (`expires_at <= now()`) leave attention summary and notification lists.
- Notification today-todo uses `COALESCE(action_due_at, created_at)` in the Asia/Shanghai business day window.

## Delivery Governance

`notificationDeliveryGovernanceService` runs after producer closure and touchpoint projection, before insert/upsert. It protects the unified attention surface from bursty or disruptive delivery while preserving the underlying record.

Rules:

- Rate limit non-critical actionable bursts by company/project/user/type/touchpoint. The default window is 5 rows per 10 minutes; the next same-bucket row is downgraded to `notification_type = system-exception` and `touchpoint_type = system_record`.
- Quiet hours use Asia/Shanghai 22:00-07:00. Non-critical `popup` and `page_banner` rows are deferred to `persistent`; `dashboard_todo` rows remain actionable so the todo queue is not lost.
- Critical severity rows bypass rate limiting and quiet-hour deferral.

Every governed row carries delivery metadata:

- `delivery_governance_version = v1.4.13-delivery-governance`
- `delivery_governance_decision = allowed | rate_limited | quiet_hours_deferred`
- `delivery_rate_limited` or `delivery_quiet_hours_applied` when a rule changes the row

## Attention Summary Contract

`/api/notifications/attention-summary` returns:

- `totalAttentionCount`: active `persistent`, `dashboard_todo`, `popup`, and `page_banner` notifications.
- `unreadNotificationCount`: active unread `persistent` notifications.
- `todayTodoCount`: backward-compatible alias for notification today-todo.
- `notificationTodayTodoCount`: active `dashboard_todo` notifications whose `COALESCE(action_due_at, created_at)` falls within the current Asia/Shanghai business day.
- `criticalCount`: active critical notifications.
- `warningCount`: backward-compatible warning attention count; includes critical count.
- `attentionWarningCount`: explicit alias for warning count including critical.
- `workspacePendingCount`: active unread workspace-scope notifications visible to the user.
- `byTouchpointType`: counts per touchpoint, including `system_record`.

`system_record` is included in `byTouchpointType` but excluded from `totalAttentionCount`.

## Dashboard Project Action Contract

Dashboard project summary continues to return `todayTodoCount` for compatibility, but the clearer field is:

- `projectTodayActionCount`: project-wide action count from due tasks, active risks/issues, pending conditions, active obstacles, and today's unread notifications.

Frontend Dashboard should prefer `projectTodayActionCount` and only fall back to `todayTodoCount` for old API responses.

## Consumers

- Header bell badge: uses loaded attention-summary zero values as authoritative; falls back only when the request has not succeeded.
- Sidebar notifications badge: same loaded-zero behavior as Header.
- Notifications page: loads `touchpointType=all` by default so `dashboard_todo` and `system_record` rows are not hidden by the route default.
- Notifications page: provides local touchpoint filters for all, notification center, today todo, popup, page banner, and system record.
- Dashboard metric cards: consume `projectTodayActionCount` for project-wide actions.

## Reconciliation Contract

`notificationReconciliationService.reconcileResolvedNotifications` is a conservative cleanup path. It only resolves active notifications whose `source_entity_type/source_entity_id` points to a known source table and that source already has a resolved/closed/completed status. It updates only notification lifecycle fields and reconciliation metadata; it never mutates risks, issues, tasks, materials, baselines, plans, or source facts.

`getNotificationReconciliationCoverageMatrix` exposes the exact source table coverage and resolved statuses used by reconciliation. The matrix is consumed by diagnostics so new source types, algorithm seeds, and workflow producers can be checked against the cleanup capability instead of silently accumulating stale todos.

## Analytics Contract

`notificationAnalyticsService` reports `byProjectionRuleVersion`, `byProducerContractVersion`, `notification_projection_rule_version_count`, and `notification_producer_contract_version_count` so mixed old/new projection or producer versions can be audited after migration or backfill.

## Diagnostics Endpoint

`GET /api/notifications/diagnostics` is the management-side diagnostic view for the unified notification/todo体系. It requires the same authenticated company/project access as notification analytics.

Response sections:

- `analytics`: runtime counts by touchpoint, lifecycle, projection rule version, and producer contract version.
- `producerAudit`: static producer closure audit for emit call sites.
- `reconciliationCoverage`: source-type coverage matrix for automatic lifecycle cleanup.
- `deliveryGovernance`: active delivery governance configuration, including rate-limit window and quiet-hour policy.

This endpoint is for diagnosis and governance closure, not for end-user attention counts. Header, Sidebar, Dashboard, and Notifications page continue to consume the regular attention-summary, notification list, and dashboard summary contracts.
