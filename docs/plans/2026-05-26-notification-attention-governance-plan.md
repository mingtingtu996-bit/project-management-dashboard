# Notification Attention Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for implementation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten notification touchpoint projection, dedupe, today-todo naming, timezone handling, and frontend consumers so badges and Dashboard counts share explicit contracts.

**Architecture:** Keep the existing write-time/read-time split. Notification emit/store remains the write-time projection and dedupe layer; `todoTouchpointService` remains the read-time notification attention summary; `projectExecutionSummaryService` remains the project-wide Dashboard summary and publishes a clearer alias.

**Tech Stack:** TypeScript, Express, Supabase/Postgres, React, Vitest.

---

### Task 1: Backend Attention Summary Contract

**Files:**
- Modify: `server/src/services/todoTouchpointService.ts`
- Test: `server/src/__tests__/todoTouchpointService.test.ts`

- [ ] Add failing tests for Shanghai business-day boundaries, `notificationTodayTodoCount`, and `attentionWarningCount`.
- [ ] Implement explicit day range helper and output aliases while keeping `todayTodoCount` and `warningCount` backward compatible.

### Task 2: Project Summary Naming Contract

**Files:**
- Modify: `server/src/services/projectExecutionSummaryService.ts`
- Modify: `client/src/services/dashboardApi.ts`
- Modify: `client/src/pages/Dashboard.tsx`
- Test: `server/src/__tests__/projectExecutionSummary.test.ts`
- Test: `client/src/pages/__tests__/notificationAttentionGovernance.contract.test.ts`

- [ ] Add failing tests that Dashboard project summary exposes/consumes `projectTodayActionCount`.
- [ ] Return `projectTodayActionCount` as an alias of existing project-wide `todayTodoCount`.
- [ ] Prefer `projectTodayActionCount` in Dashboard while keeping `todayTodoCount` as API compatibility.

### Task 3: Frontend Fallback And Notification Query Contract

**Files:**
- Modify: `client/src/hooks/useAttentionSummary.ts`
- Modify: `client/src/components/layout/Header.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/pages/Notifications.tsx`
- Test: `client/src/pages/__tests__/notificationAttentionGovernance.contract.test.ts`

- [ ] Add failing source-contract tests for loaded-zero fallback handling and notifications defaulting to all touchpoints.
- [ ] Expose `loaded` from `useAttentionSummary`.
- [ ] Use backend zero values when the attention-summary request succeeds.
- [ ] Request `touchpointType=all` from Notifications page by default.

### Task 4: Projection Metadata And Dedupe Guard

**Files:**
- Modify: `server/src/services/notificationTouchpointService.ts`
- Create: `server/migrations/167_v1413_notification_attention_governance.sql`
- Test: `server/src/__tests__/notificationTouchpointService.test.ts`
- Test: `server/src/__tests__/notificationAttentionGovernanceMigration.test.ts`

- [ ] Add failing tests that emitted notifications carry `projection_source`, `projection_rule_version`, and explicit/required dedupe metadata.
- [ ] Add migration test for a stricter active dedupe unique index including scope and touchpoint.
- [ ] Implement metadata enrichment and add the migration.

### Task 5: Documentation

**Files:**
- Create: `docs/specs/notification-attention-governance.md`

- [ ] Document the write-time projection layer, read-time attention layer, Dashboard project action count, consumer list, and field naming compatibility.
