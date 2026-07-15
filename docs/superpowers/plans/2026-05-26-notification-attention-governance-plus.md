# Notification Attention Governance Plus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining governance upgrades for notification touchpoint projection/dedupe and today todo/attention summaries.

**Architecture:** Keep write-time projection in `notificationTouchpointService` and read-time aggregation in `todoTouchpointService`. Route and frontend layers consume normalized fields only, while migration and analytics expose due-date, version, and user-state accounting.

**Tech Stack:** TypeScript, Vitest, Express routes, Supabase/Postgres migrations, React.

---

### Task 1: User-State-Aware Attention Summary

**Files:**
- Modify: `server/src/__tests__/todoTouchpointService.test.ts`
- Modify: `server/src/services/todoTouchpointService.ts`

- [ ] Write failing tests proving attention summary joins `notification_user_states`, excludes hidden/muted/expired rows, and uses `COALESCE(action_due_at, created_at)` for today todos.
- [ ] Implement SQL and fallback filtering.
- [ ] Run `npx vitest run src/__tests__/todoTouchpointService.test.ts`.

### Task 2: Touchpoint Upsert Governance

**Files:**
- Modify: `server/src/__tests__/notificationTouchpointService.test.ts`
- Modify: `server/src/services/notificationTouchpointService.ts`
- Modify: `server/src/services/notificationStore.ts`
- Modify: `server/src/services/notificationTouchpointRules.ts`

- [ ] Write failing tests for unique-violation retry, action due-date projection, canonical dedupe key metadata, and exported rule registry.
- [ ] Preserve database error code/details from inserts.
- [ ] Retry unique conflicts by reloading the active dedupe row and patching it.
- [ ] Centralize rule version/source/touchpoint registry.
- [ ] Run `npx vitest run src/__tests__/notificationTouchpointService.test.ts`.

### Task 3: Expiry, Cache Invalidation, and Reconciliation

**Files:**
- Add: `server/src/services/notificationReconciliationService.ts`
- Add: `server/src/__tests__/notificationReconciliationService.test.ts`
- Modify: `server/src/routes/notifications.ts`
- Modify: `server/src/services/todoTouchpointService.ts`

- [ ] Write failing tests/source contracts proving expired rows are excluded from fast/store lists, personal-state mutations clear attention caches, and reconciliation resolves stale source notifications.
- [ ] Add cache clear export and call it on notification mutations.
- [ ] Add a conservative reconciliation service for task/risk/issue/material/condition/obstacle/acceptance source statuses.
- [ ] Run focused backend tests.

### Task 4: Migration and Analytics

**Files:**
- Add: `server/migrations/168_v1413_notification_attention_state_due_and_reconcile.sql`
- Modify: `server/src/__tests__/notificationAttentionGovernanceMigration.test.ts`
- Modify: `server/src/services/notificationAnalyticsService.ts`
- Modify: `server/src/types/db.ts`

- [ ] Write failing tests for `action_due_at`, expiry/due indexes, reconcile bookkeeping, and projection version analytics.
- [ ] Add DB type field and analytics grouping by `metadata.projection_rule_version`.
- [ ] Run migration and analytics tests.

### Task 5: Frontend Touchpoint Filters and Docs

**Files:**
- Modify: `client/src/pages/Notifications.tsx`
- Modify: `client/src/pages/__tests__/notificationAttentionGovernance.contract.test.ts`
- Modify: `docs/specs/notification-attention-governance.md`
- Modify: `EXECUTION_PROGRESS.json`

- [ ] Write failing contract tests for touchpoint chips/select, reset behavior, and documentation.
- [ ] Implement touchpoint filter UI and local filtering.
- [ ] Document the final contracts and update execution progress closeout.
- [ ] Run focused frontend tests and typecheck.
