---
name: workbuddy-component-state-catalog
description: Use when adding or auditing WorkBuddy shared UI component states, Storybook stories, variants, controls, or component visual contracts.
---

# WorkBuddy Component State Catalog

Use this skill when a UI change touches reusable components.

## Required State Coverage

- Default, hover/focus-visible where testable, disabled, loading, empty, error, and destructive states.
- Size or density variants.
- Long labels and narrow containers.
- Icon-only or icon-leading commands when supported.
- Data confidence states for BI cards: ready, pending, insufficient, unavailable, and low-confidence.

## Storybook Rules

1. Stories live under `client/src/stories/`.
2. Keep stories deterministic: no live API calls, no random data, no current timestamps.
3. Use MSW handlers from `client/src/mocks/handlers.ts` for data scenarios.
4. Disable animated counters or unstable motion in visual stories when possible.
5. Add Chromatic parameters only when a surface is intentionally excluded or needs delay.

## Review Boundary

Storybook and Chromatic cover component composition and visual states. Full-page workflows, permissions, routing, data loading, and production readiness remain under `project-testing`.
