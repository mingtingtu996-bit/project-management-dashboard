# Wizard Duration Runtime Closure Design

## Objective

Make the project wizard generate an initial master plan from governed duration assets that a project manager can review, accept as the current baseline, and use in production without introducing a second duration source of truth.

## Current State

The generation service already consumes `standard_work_duration` and `t2_division_rhythm_template` through `algorithmSeedResolver`. It also records the resolver source and version on generated rows. When no governed runtime record exists, it falls back to the TypeScript cold-start assets.

Three gaps prevent the current flow from being treated as code-complete:

1. A high-quality `algorithm_seed_upgrade_candidates` row can reach local `auto_published` governance status, but `algorithm_seed + runtime_apply` is not registered in the governance workbench. No explicit domain writer promotes that approved candidate to a scoped runtime override.
2. Route-scoped wizard preview calls generation with the synthetic `wizard-preview` project ID. Project and company overrides can therefore be absent from Step 6 even though the final commit uses them.
3. Candidate default-master-plan review is recorded in a change log after baseline confirmation, but the normalized review is not persisted with the baseline status update. The accepted baseline is not self-contained after reload if the audit write fails.

## Architectural Decisions

### One duration authority

`standard_work_duration` remains the runtime authority for new-task and generated-plan duration. The implementation must not create a `runtime_reference_days` table or make a report JSON file a runtime data source.

Real completed-task samples remain candidate evidence. An approved candidate becomes runtime-consumable only through an explicit scoped override release. Runtime precedence remains:

1. project override;
2. company override;
3. active system seed;
4. TypeScript cold-start fallback.

### Explicit seed-override domain writer

Add `algorithmSeedOverrideReleaseExecutionService`. It accepts an explicit governance-workbench operation and:

- parses `algorithm_seed_upgrade_candidates:<uuid>` as the source publication key;
- loads the candidate from the database;
- only accepts `seed_type=standard_work_duration` and `status=auto_published`;
- derives project/company scope from the candidate instead of trusting client scope fields;
- verifies the candidate belongs to the current company and, for project scope, the requested project;
- validates and sanitizes the candidate payload with existing seed validators;
- requires release record, consumer verification, monitoring readiness, rollback writer, rollback target, evidence token, and authenticated publisher identity;
- atomically deactivates the previous scoped override and inserts the new active override in one SQL statement;
- records release lineage in `auto_governance_result.releaseExecution`;
- clears the `standard_work_duration` resolver cache.

The governance workbench delegates this operation. It does not gain direct write rights and still reports `writesRuntimeDirectly=false`; only the registered domain writer writes `algorithm_seed_overrides`.

### Wizard preview scope parity

`buildWizardProfilePreview` receives the authenticated route project and company scope. Route-scoped previews pass the real project ID to `generateWbsTemplateRows`; an unscoped new-project preview keeps the synthetic ID but supplies the authenticated company ID in `clientContext`, allowing company overrides without inventing project scope.

The final commit continues to use the real project ID. Existing resolver metadata remains the audit trail proving whether each row used a project override, company override, active seed, or fallback.

### Durable project-manager review

Candidate baseline publish/confirm already performs the project-manager review gate. Preserve that flow and avoid a second acceptance API.

When the normalized review is valid, persist it under `task_baselines.governance_metadata.candidate_governance_review` in the same baseline update that changes status and confirmation fields. The server remains authoritative for `reviewed_by` and `reviewed_at`. The change log remains an additional audit projection.

## Data Flow

1. Completed real tasks create duration experience samples.
2. Candidate discovery/replay creates `standard_work_duration` upgrade candidates.
3. Governance marks a candidate `auto_published` locally but performs no runtime write.
4. A company administrator submits `algorithm_seed + runtime_apply` with the registered writer and release evidence.
5. The domain writer publishes a project/company override and clears resolver cache.
6. Wizard preview and commit resolve the same scoped override.
7. Generated rows and baseline governance metadata retain duration lineage.
8. A project editor/owner reviews the actual generated baseline and confirms publication.
9. The normalized review is stored on the baseline and projected to the audit log.

## Security And Mutation Boundaries

- The route-supplied company ID overrides request-body company IDs.
- Candidate company/project scope is checked again in the domain writer.
- Only current-company administrators can invoke governance-workbench operations.
- Candidate payloads are validated with `validateAlgorithmSeedRuntimePayload(..., { strict: true })` and sanitized before persistence.
- The writer only touches `algorithm_seed_overrides`; it does not write tasks, baselines, dependencies, monthly plans, progress facts, or system seed records.
- Baseline review persistence only updates baseline governance metadata and the existing audit log.
- No production database command is part of implementation verification.

## Failure Behaviour

- Missing or malformed candidate publication key: operation is blocked.
- Candidate not found, wrong seed type, or not `auto_published`: no override mutation.
- Company/project scope mismatch: no override mutation.
- Missing release, consumer, monitoring, or rollback evidence: workbench blocks before delegation.
- Invalid seed payload: no old override is deactivated.
- Insert failure: the single-statement replacement leaves the previous active override intact.
- Preview without project scope: company override may be used; project override may not.

## Verification

Automated tests must prove:

- the domain writer publishes an approved project override with release lineage;
- blocked candidates and foreign scopes do not execute the mutation statement;
- workbench delegates only to the exact registered writer and only with complete release evidence;
- route-scoped wizard preview uses the real project/company scope;
- unscoped preview retains `wizard-preview` while carrying company scope;
- candidate review survives baseline reload because it is stored in governance metadata;
- existing wizard generation, baseline publish, resolver precedence, rollback, tenant isolation, type checks, and testing-center suites remain green.

## Non-Goals

- No automatic production/live publication.
- No credential repair or guarded database execution.
- No new duration table or file-based runtime loader.
- No relaxation of T2 governance validation.
- No claim that local tests replace real samples, staging replay, or production/live outcome evidence.

## Completion Criteria

The code part of this closure is complete when an approved scoped duration candidate can be explicitly published, the wizard preview and commit consume the same scope, and the project-manager review is durable on the confirmed baseline. Production readiness remains separately dependent on authorized database state, accepted real samples, T2 approval, staging verification, and production/live outcomes.
