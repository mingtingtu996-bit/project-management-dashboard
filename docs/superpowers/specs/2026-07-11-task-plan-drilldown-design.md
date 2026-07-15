# Task Plan Drilldown Design

## Objective

Connect row-specific smart expansion in the task/Gantt planning surface so a project manager can expand one approved master-plan activity into a bounded set of execution-plan children, review the preview, and commit those children under the selected task without materializing the complete template catalog.

## Planning Levels And Row Budgets

The product must treat planning levels as separate operational surfaces rather than one ever-growing schedule:

| Planning level | Normal building-project size | Product role |
|---|---:|---|
| Wizard master plan | 80-200 rows, up to 300 for complex projects | Project-level control, interfaces, milestones, and handover |
| Project execution plan | 300-800 rows for a normal building project | Production-manager and discipline coordination |
| Monthly plan | 80-250 active rows | Monthly workface and resource coordination |
| Weekly plan | 30-100 active rows | Crew-level execution |
| Governed process library | 1,000-3,000 possible rows across the whole project | On-demand source material, never one initial schedule |

The existing project-facts recommendation range of 60-300 rows remains the authority for wizard master plans. The existing 500-row server fuse remains only a single-operation or single-batch general-generation safety boundary, not a project-total limit or a target size. A project execution plan may accumulate more than 500 rows through governed expansions; crossing 500 persisted project rows must never block a later row-specific expansion.

## Inclusion Policy

The project execution plan should materialize:

- physical construction work that owns a workface or meaningful duration;
- project, building, section, discipline, acceptance, and handover control milestones;
- interfaces that release downstream work, such as sample acceptance, enclosure closure, energization, elevator inspection, commissioning, and statutory acceptance;
- dependencies required to explain the dates;
- only those external waits or resource constraints that actually control the selected work package.

The default expansion must not materialize:

- repeated measurement, briefing, inspection, form, record, or checklist rows for every floor;
- tower crane, construction hoist, labor, or equipment detail unless it is an explicit schedule constraint;
- every room, component, inspection lot, or equipment instance;
- mutually exclusive method alternatives;
- every building, floor, and zone when the selected parent belongs to only one scope.

Supporting controls remain metadata, linked projections, or later plan/checklist surfaces unless the project manager explicitly promotes them.

## Selected-Row Expansion Flow

1. The user invokes Smart Expand on one task row.
2. Gantt passes the selected task ID instead of opening the project-wide generation wizard without context.
3. A route-level lazy drilldown workbench loads the task, project scope, template lineage, and existing child count.
4. The workbench locks the generation scope to the selected parent task. The user may narrow the scope but may not widen it to unrelated buildings or sections.
5. The default action generates exactly one governed drilldown level:
   - `master_control` parent to `process_detail` children;
   - `process_detail` parent to `activity_step` children only after a second explicit expansion.
6. The user reviews generated rows and deselects unwanted children.
7. Commit sends one existing `template_generate` planning-table operation with `attachUnderRowId`, selected preview rows, generation lineage, and dependencies.
8. The server commits tasks and dependencies transactionally. On success the app returns to Gantt, refreshes tasks, expands the parent, and highlights the new children.

The full project wizard remains available from the page-level generation command. Row-level Smart Expand never opens that wizard.

## Template And Scope Resolution

The drilldown workbench resolves defaults in this order:

1. parent task source template and template-node lineage;
2. parent standard-work code and WBS category;
3. parent execution phase and business type;
4. explicit user template selection when lineage cannot be resolved.

No catalog root is auto-selected merely because a template was loaded. A matching node may be preselected only when its lineage or governed standard-work mapping matches the selected parent.

Drilldown depth is stored as independent generation lineage and must not be inferred from the display `wbs_node_type`. Residential master-plan activity rows may already render as `process`; they remain `master_control` until a row-specific expansion creates governed `process_detail` children. Generated rows record their `drilldownGenerationLevel`, source parent, generation batch, and selected template node so the next expansion is deterministic.

The operation inherits these parent fields when present:

- project ID;
- building, basement, section, floor, physical-zone, and functional-area object IDs;
- engineering category;
- planned start and end window;
- execution phase/lane and standard-work lineage.

## Row Limits

- Target per expansion: 5-40 selected child rows.
- Hard server limit per selected-row preview or commit: 80 generated schedule rows.
- Project-total task count is not subject to the 500-row generation fuse; 500 remains a single-operation or single-batch technical boundary for non-drilldown generation.
- The client displays generated and selected counts and blocks apply above 80.
- Activity-step generation is never enabled on the first expansion of a master-plan row.
- When a request exceeds 80 rows, no preview rows are committed. The response instructs the user to select a narrower node, building, section, floor range, or work package.
- The task page warns when the project execution plan exceeds 800 rows and requires filters or narrower scope for subsequent expansion; it does not delete or collapse valid existing work.
- A task-page view should render no more than 300 visible rows without filtering or virtualization, even when the project contains more persisted tasks.

The 80-row rule must be enforced by the server whenever `attachUnderRowId` is present. Client checks are usability controls only.

## Components And Contracts

### Gantt row action

Change the row action contract from `onGenerateTasks?: () => void` to a task-aware callback. The page-level generation action continues to call the callback without a task; row-level Smart Expand passes the selected task.

### Drilldown route/workbench

Add an `expand` modeling-workbench mode or an equivalent lazy task-drilldown route. The URL carries only the project and parent task identity. The workbench fetches authoritative parent data instead of trusting scope and title query parameters.

### Template preview

Reuse the existing template library, preview endpoint, generated-row selector, and `attachUnderRowId` contract. Add a drilldown policy to prevent root auto-selection, restrict depth, expose counts, and surface the 80-row error.

### Commit

Reuse `commitTaskListTable` and the existing `template_generate` operation. Do not introduce direct task inserts from the client. The operation includes only preview rows retained by the user, and the server remains responsible for ID mapping, hierarchy, dependency writes, permissions, and transaction rollback.

## Failure Behaviour

- Missing or inaccessible parent task: close with a not-found/permission message and perform no mutation.
- Parent has no resolvable lineage: show filtered template selection with nothing auto-selected.
- Scope expansion would leave the parent scope: block preview.
- More than 80 generated rows: return the governed drilldown limit error with zero writes.
- No selected preview rows: disable apply.
- Duplicate children under skip policy: show skipped count; do not create duplicates.
- Commit or dependency failure: rollback the complete operation and keep the preview for retry.
- Stale parent version or permissions: reject commit and require refresh.

## Verification

Automated tests must prove:

- the Gantt row action passes the selected task ID;
- the page-level generation command still opens the full project wizard;
- drilldown loads authoritative parent scope and template lineage;
- no template roots are selected by default without a parent match;
- master-plan rows generate only process children on the first expansion;
- process rows may explicitly generate activity-step children;
- display node types cannot bypass the `master_control -> process_detail -> activity_step` lineage;
- preview and commit retain `attachUnderRowId`;
- the server rejects the 81st drilldown row before materialization or mutation;
- selected preview rows commit as children with dependencies in one transaction;
- commit failure creates neither tasks nor dependencies;
- existing baseline inline expansion, wizard generation, task editing, and the 500-row global fuse remain green;
- task/Gantt route loading remains lazy and does not pull the full project wizard into the normal task-list bundle.

## Non-Goals

- Do not generate the complete detailed project schedule in one action.
- Do not create monthly or weekly plans from this command.
- Do not automatically promote quality, safety, material, or document checklists to schedule rows.
- Do not write production data during local verification.
- Do not claim production/live readiness without authorized database, permission, transaction, performance, and tenant-isolation evidence.

## Acceptance Criteria

The feature is code-complete when a user can select one task in Gantt, preview no more than 80 context-compatible next-level children, commit the selected children under that task transactionally, return to the refreshed task tree, and repeat expansion on a process row for activity steps without any path that recreates the previous project-wide thousand-row expansion.
