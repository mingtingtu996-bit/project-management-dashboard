# Duration Asset Review And Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every non-automatic decision for the six duration-learning runtime asset families, expose a tenant-safe unified `/admin/duration-assets` workbench, and show persisted benchmark provenance in user-facing duration suggestions.

**Architecture:** Migration 325 adds a durable review projection keyed by a canonical decision fingerprint that references existing candidate, conflict, evidence, monitoring, and publication authorities without copying runtime payloads. The lifecycle writes or resolves review items in the same database transaction as its decision; project-scoped benchmark promotion reuses the existing atomic benchmark writer so publication promotion, current-row activation, cause-segment activation, impact recording, and queue resolution commit or roll back together. The new admin page combines the queue with existing publication, monitoring, and accuracy read models; benchmark provenance from persisted rows and runtime publications is carried as a complete single-or-blended candidate set instead of being inferred from one primary candidate.

**Tech Stack:** TypeScript, Express, Zod, PostgreSQL, Supabase/PostgreSQL fixed-query adapters, React, React Router, Vitest, Testing Library, Playwright.

## Global Constraints

- Implementation base is immutable commit `c66c79188cb773b6d3ff878bf1f9afe178ace8cf` on `codex/full-code-correctness-closeout`.
- Application deployment remains frozen; do not apply migration 325 to staging or production during implementation.
- Database changes are additive and use exact migration identity `325_duration_asset_review_queue.sql`; migration 324 remains unchanged.
- The six and only six reviewable runtime asset keys are `base_duration_benchmark`, `standard_work_duration_seed`, `special_work_duration_seed`, `wbs_reference_days`, `dependency_rule_candidate`, and `critical_path_rule_candidate`.
- A lifecycle decision and its required review item are one transaction. Queue persistence failure fails the lifecycle attempt and cannot be reported as successful `manualFallback` or `candidateCollecting` work.
- Review items reference source authority. They must not copy `runtimePayload`, full candidate payloads, raw evidence bodies, credentials, or tenant-private runtime contexts.
- Every queue writer uses a deterministic source key containing a canonical decision fingerprint. Exact evidence replay reuses the same open or terminal item; any material change to runtime-payload hash, sorted source references, conflict/replay state, policy evidence, monitoring evidence, or reason codes creates a new item.
- Candidate approval delegates to `persistDurationLearningRuntimePublication`. Stable approval delegates to `promoteDurationLearningRuntimeCanary`, except project-scoped `base_duration_benchmark`, which must delegate to `promoteDurationBenchmarkRuntimeCanaryAtomically`; the queue is not a parallel publication engine.
- Rejection and supersession update only the review projection and never mutate a published runtime asset.
- Company administrators may mutate only current-company `company` or server-authorized visible-project `project` items. `industry` and `global` items are sanitized and read-only on every company-admin surface.
- Manual mutation of `industry` and `global` items is rejected unconditionally in this workstream. Existing automatic lifecycle governance may continue; this plan does not invent an operator identity, operator HTTP endpoint, or new secret boundary.
- `users.global_role = 'company_admin'` is not a platform/operator boundary. Current `company_members.role` authority remains mandatory.
- Existing `/admin/duration-accuracy` and `/admin/rule-assets/governance-workbench` URLs remain compatible for one release.
- Benchmark timestamps come only from persisted `duration_benchmarks`, cause segments, or runtime-publication payloads. Provenance preserves exact `project`, `company`, `industry`, and `global` scope, includes `benchmarkVersion`, and records every candidate used by a blend. Availability is `available` only when every required field of every used candidate is valid; partial and unavailable states carry explicit reason codes, and current wall-clock time is never substituted.
- Do not modify `EXECUTION_PROGRESS.json`.
- Local tests, screenshots, and reports are not staging, production, deployment, migration-apply, or live evidence.

## File Structure

- `server/migrations/325_duration_asset_review_queue.sql`: additive review table, constraints, indexes, RLS, grants, and update trigger.
- `server/migrations/rollback/325_duration_asset_review_queue.sql`: removes only migration 325 objects.
- `server/src/services/durationAssetReviewQueueService.ts`: six-key validation, canonical decision fingerprints, deterministic source keys, bounded payloads, idempotent upsert, attributed resolution, and sanitized list read model.
- `server/src/services/durationAssetReviewDecisionService.ts`: transactional approve/reject/supersede adapter over existing publication writers.
- `server/src/services/durationLearningRuntimeLifecycleService.ts`: persists candidate and stable-promotion review requirements and resolves prior items around publication, impact recording, and promotion.
- `server/src/services/durationLearningAssetAtomicStoreService.ts`: remains the only project-benchmark stable-promotion writer and participates in the lifecycle/decision service outer ALS transaction.
- `server/src/routes/duration-assets.ts`: company-admin queue/read HTTP surface; review commands stay on the existing rule-asset workbench operation route.
- `client/src/services/durationAssetsApi.ts`: queue DTOs and decision commands.
- `client/src/pages/DurationAssetsAdmin.tsx`: unified queue, published, monitoring, and accuracy tabs.
- `client/src/services/durationSuggestionsApi.ts` and `client/src/components/planning/DurationSuggestionTooltip.tsx`: single/blended benchmark provenance DTO and display.
- `project-testing/tools/verify-duration-assets-admin-ui.mjs`: deterministic desktop/mobile browser verification with intercepted API responses.

---

### Task 1: Migration 325 Durable Review Projection

**Files:**
- Create: `server/migrations/325_duration_asset_review_queue.sql`
- Create: `server/migrations/rollback/325_duration_asset_review_queue.sql`
- Modify: `server/migrations/CLEAN_MIGRATION_V4.sql`
- Create: `server/src/__tests__/durationAssetReviewMigration.test.ts`
- Modify: `server/src/__tests__/migrationEntryPoints.test.ts`

**Interfaces:**
- Produces table `public.duration_asset_review_items`.
- Produces unique deterministic identity `source_key` plus persisted `decision_fingerprint`.
- Produces statuses `open`, `approved`, `rejected`, `superseded`, and `resolved_by_publication`.
- Produces resolution sources `automatic_publication`, `manual_approval`, `manual_rejection`, and `manual_supersession`.
- Depends on migration 324 and the existing composite project/company key.

- [ ] **Step 1: Write the migration RED**

Create `durationAssetReviewMigration.test.ts` with exact forward/CLEAN/rollback assertions:

```ts
const migrationName = '325_duration_asset_review_queue.sql'

function extractPolicy(sql: string, name: string) {
  const start = sql.indexOf(`CREATE POLICY ${name}`)
  if (start < 0) throw new Error(`missing policy ${name}`)
  const end = sql.indexOf(';', start)
  if (end < 0) throw new Error(`unterminated policy ${name}`)
  return sql.slice(start, end + 1)
}

function extractConstraint(sql: string, name: string) {
  const marker = `CONSTRAINT ${name} CHECK (`
  const start = sql.indexOf(marker)
  if (start < 0) throw new Error(`missing constraint ${name}`)
  let depth = 0
  for (let index = start + marker.length - 1; index < sql.length; index += 1) {
    if (sql[index] === '(') depth += 1
    if (sql[index] === ')') depth -= 1
    if (depth === 0) return sql.slice(start, index + 1)
  }
  throw new Error(`unterminated constraint ${name}`)
}

it('defines the six-family durable queue with bounded payloads', () => {
  const forward = readSql('migrations', migrationName)
  expect(forward).toContain('CREATE TABLE IF NOT EXISTS public.duration_asset_review_items')
  expect(forward).toContain("CHECK (asset_key IN ('base_duration_benchmark','standard_work_duration_seed','special_work_duration_seed','wbs_reference_days','dependency_rule_candidate','critical_path_rule_candidate'))")
  expect(forward).toContain("CHECK (status IN ('open','approved','rejected','superseded','resolved_by_publication'))")
  expect(forward).toContain("CHECK (review_kind IN ('candidate_publication','stable_promotion'))")
  expect(forward).toContain("decision_fingerprint TEXT NOT NULL CHECK (decision_fingerprint ~ '^[a-f0-9]{64}$')")
  expect(forward).toContain("CHECK (resolution_source IN ('automatic_publication','manual_approval','manual_rejection','manual_supersession'))")
  expect(forward).toContain('CHECK (pg_column_size(review_payload) <= 32768)')
  expect(forward).toContain('UNIQUE (source_key)')
})

it('keeps company/project ownership and shared-scope authority fail closed', () => {
  const forward = readSql('migrations', migrationName)
  expect(forward).toContain('FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id)')
  expect(forward).toContain('ALTER TABLE public.duration_asset_review_items FORCE ROW LEVEL SECURITY')
  expect(forward).toMatch(/CREATE POLICY duration_asset_review_items_member_read[\s\S]+FOR SELECT[\s\S]+TO authenticated[\s\S]+scope_level IN \('company','project'\)[\s\S]+workbuddy_private\.is_active_company_member\([\s\S]+company_id,[\s\S]+ARRAY\['company_admin'\]::TEXT\[\][\s\S]+\)[\s\S]+EXISTS \([\s\S]+FROM public\.projects project[\s\S]+project\.id = duration_asset_review_items\.project_id[\s\S]+project\.company_id = duration_asset_review_items\.company_id/)
  const memberPolicy = extractPolicy(forward, 'duration_asset_review_items_member_read')
  expect(memberPolicy).not.toMatch(/scope_level\s*=\s*'(industry|global)'/)
  expect(forward).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]+TO authenticated/)
  expect(forward).toMatch(/CREATE POLICY duration_asset_review_items_backend_runtime[\s\S]+FOR ALL[\s\S]+TO workbuddy_runtime[\s\S]+USING \([\s\S]+current_user = 'workbuddy_runtime'[\s\S]+pg_has_role\(current_user, 'workbuddy_runtime', 'member'\)[\s\S]+\)[\s\S]+WITH CHECK \([\s\S]+current_user = 'workbuddy_runtime'[\s\S]+pg_has_role\(current_user, 'workbuddy_runtime', 'member'\)/)
})

it('maps every status to one non-contradictory resolution state', () => {
  const forward = readSql('migrations', migrationName)
  const stateConstraint = extractConstraint(forward, 'duration_asset_review_items_resolution_state_check')
  expect(stateConstraint).toContain("status = 'open'")
  expect(stateConstraint).toContain("status = 'approved' AND resolution_source = 'manual_approval'")
  expect(stateConstraint).toContain("status = 'rejected' AND resolution_source = 'manual_rejection'")
  expect(stateConstraint).toContain("status = 'superseded' AND resolution_source = 'manual_supersession'")
  expect(stateConstraint).toContain("status = 'resolved_by_publication'")
  expect(stateConstraint).toContain("NULLIF(BTRIM(resolved_publication_key), '') IS NOT NULL")
  expect(stateConstraint).toMatch(/status = 'open'[\s\S]+reviewed_by_user_id IS NULL[\s\S]+reviewed_at IS NULL[\s\S]+decision_reason IS NULL[\s\S]+resolution_source IS NULL[\s\S]+resolved_publication_key IS NULL/)
  expect(stateConstraint).toMatch(/resolution_source = 'automatic_publication' AND reviewed_by_user_id IS NULL/)
  expect(stateConstraint).toMatch(/resolution_source = 'manual_approval' AND reviewed_by_user_id IS NOT NULL/)
})

it('keeps forward and clean-install table definitions byte-equivalent', () => {
  expect(extractMarkedSegment(readSql('migrations', migrationName)))
    .toBe(extractMarkedSegment(readSql('migrations', 'CLEAN_MIGRATION_V4.sql')))
})
```

- [ ] **Step 2: Run the RED**

Run:

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationAssetReviewMigration.test.ts src/__tests__/migrationEntryPoints.test.ts
```

Expected: FAIL because migration 325 and its rollback do not exist.

- [ ] **Step 3: Add the forward schema and exact CLEAN segment**

Use this schema contract in both forward and CLEAN files between markers `-- BEGIN MIGRATION 325` and `-- END MIGRATION 325`:

```sql
CREATE TABLE IF NOT EXISTS public.duration_asset_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_level TEXT NOT NULL CHECK (scope_level IN ('project','company','industry','global')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL,
  industry_key TEXT NULL,
  asset_key TEXT NOT NULL CHECK (asset_key IN (
    'base_duration_benchmark','standard_work_duration_seed','special_work_duration_seed',
    'wbs_reference_days','dependency_rule_candidate','critical_path_rule_candidate'
  )),
  artifact_key TEXT NOT NULL,
  review_kind TEXT NOT NULL CHECK (review_kind IN ('candidate_publication','stable_promotion')),
  decision_fingerprint TEXT NOT NULL CHECK (decision_fingerprint ~ '^[a-f0-9]{64}$'),
  source_key TEXT NOT NULL UNIQUE,
  proposal_key TEXT NULL,
  candidate_event_ref TEXT NULL,
  conflict_ref TEXT NULL,
  publication_key TEXT NULL,
  resolved_publication_key TEXT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  review_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (pg_column_size(review_payload) <= 32768),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','approved','rejected','superseded','resolved_by_publication'
  )),
  assigned_to_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  decision_reason TEXT NULL,
  resolution_source TEXT NULL CHECK (resolution_source IN (
    'automatic_publication','manual_approval','manual_rejection','manual_supersession'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (scope_level = 'project' AND company_id IS NOT NULL AND project_id IS NOT NULL AND industry_key IS NULL)
    OR (scope_level = 'company' AND company_id IS NOT NULL AND project_id IS NULL AND industry_key IS NULL)
    OR (scope_level = 'industry' AND company_id IS NULL AND project_id IS NULL AND NULLIF(BTRIM(industry_key), '') IS NOT NULL)
    OR (scope_level = 'global' AND company_id IS NULL AND project_id IS NULL AND industry_key IS NULL)
  ),
  CONSTRAINT duration_asset_review_items_resolution_state_check CHECK (
    (
      status = 'open'
      AND reviewed_by_user_id IS NULL
      AND reviewed_at IS NULL
      AND decision_reason IS NULL
      AND resolution_source IS NULL
      AND resolved_publication_key IS NULL
    )
    OR (
      status = 'approved' AND resolution_source = 'manual_approval'
      AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND NULLIF(BTRIM(decision_reason), '') IS NOT NULL
      AND resolved_publication_key IS NULL
    )
    OR (
      status = 'rejected' AND resolution_source = 'manual_rejection'
      AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND NULLIF(BTRIM(decision_reason), '') IS NOT NULL
      AND resolved_publication_key IS NULL
    )
    OR (
      status = 'superseded' AND resolution_source = 'manual_supersession'
      AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND NULLIF(BTRIM(decision_reason), '') IS NOT NULL
      AND resolved_publication_key IS NULL
    )
    OR (
      status = 'resolved_by_publication'
      AND resolution_source IN ('automatic_publication','manual_approval')
      AND reviewed_at IS NOT NULL
      AND NULLIF(BTRIM(decision_reason), '') IS NOT NULL
      AND NULLIF(BTRIM(resolved_publication_key), '') IS NOT NULL
      AND (
        (resolution_source = 'automatic_publication' AND reviewed_by_user_id IS NULL)
        OR (resolution_source = 'manual_approval' AND reviewed_by_user_id IS NOT NULL)
      )
    )
  ),
  FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_duration_asset_review_items_queue
  ON public.duration_asset_review_items (status, asset_key, scope_level, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_duration_asset_review_items_company_project
  ON public.duration_asset_review_items (company_id, project_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS set_duration_asset_review_items_updated_at ON public.duration_asset_review_items;
CREATE TRIGGER set_duration_asset_review_items_updated_at
  BEFORE UPDATE ON public.duration_asset_review_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

Enable and force RLS. Revoke all from `PUBLIC`, `anon`, `authenticated`, `workbuddy_runtime`, and optional `service_role`, then grant `SELECT` to `authenticated` and CRUD to `workbuddy_runtime`. Use these exact policy predicates:

```sql
CREATE POLICY duration_asset_review_items_member_read
  ON public.duration_asset_review_items
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND duration_asset_review_items.scope_level IN ('company','project')
    AND duration_asset_review_items.company_id IS NOT NULL
    AND workbuddy_private.is_active_company_member(
      duration_asset_review_items.company_id,
      ARRAY['company_admin']::TEXT[]
    )
    AND (
      (
        duration_asset_review_items.scope_level = 'company'
        AND duration_asset_review_items.project_id IS NULL
      )
      OR (
        duration_asset_review_items.scope_level = 'project'
        AND duration_asset_review_items.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.projects project
          WHERE project.id = duration_asset_review_items.project_id
            AND project.company_id = duration_asset_review_items.company_id
        )
      )
    )
  );

CREATE POLICY duration_asset_review_items_backend_runtime
  ON public.duration_asset_review_items
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );
```

The authenticated policy has no shared-scope branch; `industry` and `global` rows are available only through the backend route's sanitized read model.

- [ ] **Step 4: Add rollback parity**

Rollback in dependency-safe order:

```sql
BEGIN;
DROP POLICY IF EXISTS duration_asset_review_items_member_read ON public.duration_asset_review_items;
DROP POLICY IF EXISTS duration_asset_review_items_backend_runtime ON public.duration_asset_review_items;
DROP TRIGGER IF EXISTS set_duration_asset_review_items_updated_at ON public.duration_asset_review_items;
DROP TABLE IF EXISTS public.duration_asset_review_items;
NOTIFY pgrst, 'reload schema';
COMMIT;
```

- [ ] **Step 5: Run migration tests and commit**

Run the Step 2 command again and expect all tests PASS. Then:

```powershell
git add server/migrations/325_duration_asset_review_queue.sql server/migrations/rollback/325_duration_asset_review_queue.sql server/migrations/CLEAN_MIGRATION_V4.sql server/src/__tests__/durationAssetReviewMigration.test.ts server/src/__tests__/migrationEntryPoints.test.ts
git commit -m "feat(duration-assets): add durable review queue schema"
```

---

### Task 2: Queue Domain And Persistence Service

**Files:**
- Create: `server/src/services/durationAssetReviewQueueService.ts`
- Create: `server/src/__tests__/durationAssetReviewQueueService.test.ts`

**Interfaces:**
- Produces `DURATION_ASSET_REVIEW_KEYS`, `DurationAssetReviewKey`, `DurationAssetReviewScope`, `DurationAssetReviewItem`, and `DurationAssetReviewQueueStore`.
- Produces `buildDurationAssetReviewSourceKey`, `buildDurationAssetReviewPayload`, `createDatabaseDurationAssetReviewQueueStore`, and `listDurationAssetReviewItems`.
- Consumes `DurationLearningRuntimeAssetKey`, `DurationLearningRuntimeScope`, and fixed `executeSQL` queries.

- [ ] **Step 1: Write queue REDs**

Cover these exact cases:

```ts
const fingerprintInput: BuildDurationAssetReviewDecisionFingerprintInput = {
  runtimePayload: { p50Days: 12, benchmarkVersion: 'v7' },
  sourceCandidateRefs: ['candidate:b', 'candidate:a'],
  sourceEvidenceRefs: ['evidence:2', 'evidence:1'],
  conflictState: { conflictCount: 0 },
  replayState: { replayPassed: true },
  policyEvidence: {
    evaluationRequired: true,
    stage: 'manual_canary',
    autoPromotionAllowed: false,
    manualReviewRequired: true,
    reasonCodes: ['manual_review_required'],
    evidence: { holdoutSampleCount: 12, maeBefore: 8, maeAfter: 6 },
  },
  reasonCodes: ['manual_review_required'],
  monitoringEvidence: null,
}

const decisionFingerprint = buildDurationAssetReviewDecisionFingerprint(fingerprintInput)
const input: BuildDurationAssetReviewSourceKeyInput = {
  reviewKind: 'candidate_publication',
  assetKey: 'base_duration_benchmark',
  artifactKey: 'benchmark:task:process:all',
  proposalKey: 'proposal-1',
  publicationKey: null,
  decisionFingerprint,
  scope: { level: 'project', companyId: 'company-1', projectId: 'project-1' },
}

it.each(DURATION_ASSET_REVIEW_KEYS)('accepts the registered asset %s', (assetKey) => {
  expect(requireDurationAssetReviewKey(assetKey)).toBe(assetKey)
})

it('builds a scope-specific deterministic source key', () => {
  const first = buildDurationAssetReviewSourceKey(input)
  expect(buildDurationAssetReviewSourceKey(input)).toBe(first)
  expect(buildDurationAssetReviewSourceKey({ ...input, scope: { level: 'company', companyId: 'company-1' } }))
    .not.toBe(first)
})

it('canonicalizes reference order but changes identity for material evidence changes', () => {
  const reordered = buildDurationAssetReviewDecisionFingerprint({
    ...fingerprintInput,
    sourceCandidateRefs: ['candidate:a', 'candidate:b'],
    sourceEvidenceRefs: ['evidence:1', 'evidence:2'],
  })
  expect(reordered).toBe(decisionFingerprint)

  const changedPayload = buildDurationAssetReviewDecisionFingerprint({
    ...fingerprintInput,
    runtimePayload: { p50Days: 13, benchmarkVersion: 'v8' },
  })
  expect(buildDurationAssetReviewSourceKey({ ...input, decisionFingerprint: changedPayload }))
    .not.toBe(buildDurationAssetReviewSourceKey(input))
})

it('reuses an open row and does not reopen a terminal row', async () => {
  const first = await store.upsertOpen(input)
  const repeated = await store.upsertOpen(input)
  expect(repeated).toMatchObject({ id: first.id, disposition: 'reused' })
  await store.decide({
    id: first.id,
    status: 'rejected',
    reviewerUserId: 'user-1',
    reviewedAt: '2026-07-23T08:00:00.000Z',
    decisionReason: 'not applicable',
    resolutionSource: 'manual_rejection',
  })
  await expect(store.upsertOpen(input)).resolves.toMatchObject({ id: first.id, status: 'rejected', disposition: 'terminal_reused' })
  await expect(store.upsertOpen({
    ...input,
    decisionFingerprint: buildDurationAssetReviewDecisionFingerprint({
      ...fingerprintInput,
      policyEvidence: { ...fingerprintInput.policyEvidence, reasonCodes: ['new_policy_reason'] },
      reasonCodes: ['new_policy_reason'],
    }),
  })).resolves.toMatchObject({ status: 'open', disposition: 'created' })
})

it('records automatic publication resolution without fabricating a reviewer', async () => {
  await store.resolveByPublication({
    sourceKey: buildDurationAssetReviewSourceKey(input),
    publicationKey: 'publication-auto',
    reviewedAt: '2026-07-23T08:00:00.000Z',
    resolutionSource: 'automatic_publication',
    reviewerUserId: null,
    decisionReason: 'automatic_policy_approved',
  })
  expect(queryExec).toHaveBeenCalledWith(expect.stringContaining('reviewed_by_user_id = $'), expect.arrayContaining([null]))
})

it('records the real reviewer and reason for manual approval', async () => {
  await store.resolveByPublication({
    sourceKey: 'review-manual',
    publicationKey: 'publication-manual',
    reviewedAt: '2026-07-23T08:00:00.000Z',
    resolutionSource: 'manual_approval',
    reviewerUserId: 'user-1',
    decisionReason: 'validated against replay evidence',
  })
  expect(queryExec).toHaveBeenCalledWith(
    expect.stringContaining('resolution_source'),
    expect.arrayContaining(['manual_approval', 'user-1', 'validated against replay evidence']),
  )
})

it('automatically resolves every open fingerprint for the same publication lineage', async () => {
  await seedOpenRows([
    { sourceKey: 'review-old', decisionFingerprint: 'fingerprint-old' },
    { sourceKey: 'review-new', decisionFingerprint: 'fingerprint-new' },
  ])
  await expect(store.resolveOpenByPublicationIdentity({
    reviewKind: 'stable_promotion',
    assetKey: 'standard_work_duration_seed',
    artifactKey: 'seed:work-1',
    scope: { level: 'company', companyId: 'company-1' },
    publicationKey: 'publication-1',
    reviewedAt: '2026-07-23T08:00:00.000Z',
    resolutionSource: 'automatic_publication',
    reviewerUserId: null,
    decisionReason: 'automatic_stable_promotion',
  })).resolves.toBe(2)
})

it('sanitizes industry and global rows for company-admin reads', async () => {
  const result = await listDurationAssetReviewItems({ companyId: 'company-1', projectIds: ['project-1'], queryExec })
  expect(result.items.find((item) => item.scope.level === 'global')).toEqual(expect.objectContaining({
    canReview: false,
    proposalKey: null,
    candidateEventRef: null,
    conflictRef: null,
    reviewPayload: null,
  }))
})
```

Also lock project/company mismatch, unknown asset/scope, payloads over 32 KiB, duplicate reason normalization, fixed SQL parameters, no runtime payload key in the bounded projection, a manual resolution without `reviewerUserId`, an automatic resolution with a fabricated reviewer, an empty decision reason, and terminal replay under the exact same fingerprint.

- [ ] **Step 2: Run the RED**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationAssetReviewQueueService.test.ts
```

Expected: FAIL because the queue service does not exist.

- [ ] **Step 3: Implement the domain contract**

Start with exact constants and source identity:

```ts
export const DURATION_ASSET_REVIEW_KEYS = [
  'base_duration_benchmark',
  'standard_work_duration_seed',
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
] as const satisfies readonly DurationLearningRuntimeAssetKey[]

export type DurationAssetReviewKey = typeof DURATION_ASSET_REVIEW_KEYS[number]
export type DurationAssetReviewScope = DurationLearningRuntimeScope
export type DurationAssetReviewStatus = 'open' | 'approved' | 'rejected' | 'superseded' | 'resolved_by_publication'
export type DurationAssetReviewKind = 'candidate_publication' | 'stable_promotion'
export type DurationAssetReviewResolutionSource =
  | 'automatic_publication'
  | 'manual_approval'
  | 'manual_rejection'
  | 'manual_supersession'

export interface BuildDurationAssetReviewDecisionFingerprintInput {
  runtimePayload: Record<string, unknown>
  sourceCandidateRefs: string[]
  sourceEvidenceRefs: string[]
  conflictState: { conflictCount: number }
  replayState: { replayPassed: boolean | null }
  policyEvidence: {
    evaluationRequired: boolean
    stage: string | null
    autoPromotionAllowed: boolean | null
    manualReviewRequired: boolean | null
    reasonCodes: string[]
    evidence: Record<string, unknown> | null
  }
  reasonCodes: string[]
  monitoringEvidence: null | {
    publicationKey: string
    monitoringStatus: string
    monitoringMetrics: Record<string, unknown>
    stableDecision: Record<string, unknown>
  }
}

export interface BuildDurationAssetReviewSourceKeyInput {
  reviewKind: DurationAssetReviewKind
  assetKey: DurationAssetReviewKey
  artifactKey: string
  proposalKey?: string | null
  publicationKey?: string | null
  decisionFingerprint: string
  scope: DurationLearningRuntimeScope
}

export type DurationAssetReviewTransactionRunner = <T>(work: () => Promise<T>) => Promise<T>

export interface DurationAssetReviewItem {
  id: string
  sourceKey: string
  decisionFingerprint: string
  reviewKind: DurationAssetReviewKind
  assetKey: DurationAssetReviewKey
  artifactKey: string
  scope: DurationLearningRuntimeScope
  proposalKey: string | null
  candidateEventRef: string | null
  conflictRef: string | null
  publicationKey: string | null
  resolvedPublicationKey: string | null
  reasonCodes: string[]
  reviewPayload: Record<string, unknown> | null
  status: DurationAssetReviewStatus
  canReview: boolean
  approvalReady: boolean
  assignedToUserId: string | null
  reviewedByUserId: string | null
  reviewedAt: string | null
  decisionReason: string | null
  resolutionSource: DurationAssetReviewResolutionSource | null
  createdAt: string
  updatedAt: string
}

export interface UpsertDurationAssetReviewItemInput extends BuildDurationAssetReviewSourceKeyInput {
  candidateEventRef?: string | null
  conflictRef?: string | null
  reasonCodes: string[]
  reviewPayload: Record<string, unknown>
}

export interface ResolveDurationAssetReviewItemInput {
  sourceKey: string
  publicationKey: string
  reviewedAt: string
  resolutionSource: 'automatic_publication' | 'manual_approval'
  reviewerUserId: string | null
  decisionReason: string
}

export interface ResolveOpenDurationAssetReviewItemsByPublicationInput {
  reviewKind: DurationAssetReviewKind
  assetKey: DurationAssetReviewKey
  artifactKey: string
  scope: DurationLearningRuntimeScope
  proposalKey?: string | null
  publicationKey: string
  reviewedAt: string
  resolutionSource: 'automatic_publication'
  reviewerUserId: null
  decisionReason: string
}

export interface DecideDurationAssetReviewProjectionInput {
  id: string
  status: 'rejected' | 'superseded'
  reviewerUserId: string
  reviewedAt: string
  decisionReason: string
  resolutionSource: 'manual_rejection' | 'manual_supersession'
}

export interface DurationAssetReviewWriteResult {
  item: DurationAssetReviewItem
  disposition: 'created' | 'reused' | 'terminal_reused' | 'resolved' | 'decided'
}

export interface ListDurationAssetReviewItemsInput {
  companyId: string
  projectIds: string[] | null
  assetKey?: DurationAssetReviewKey | null
  scopeLevel?: DurationLearningRuntimeScope['level'] | null
  projectId?: string | null
  reason?: string | null
  status?: DurationAssetReviewStatus | null
  age?: 'all' | '24h' | '7d' | '30d'
  limit?: number
  now?: string
}

export interface DurationAssetReviewReadModel {
  generatedAt: string
  items: DurationAssetReviewItem[]
  total: number
}

export interface DurationAssetReviewQueueStore {
  upsertOpen(input: UpsertDurationAssetReviewItemInput): Promise<DurationAssetReviewWriteResult>
  loadForUpdate(id: string): Promise<DurationAssetReviewItem | null>
  resolveByPublication(input: ResolveDurationAssetReviewItemInput): Promise<DurationAssetReviewWriteResult>
  resolveOpenByPublicationIdentity(input: ResolveOpenDurationAssetReviewItemsByPublicationInput): Promise<number>
  decide(input: DecideDurationAssetReviewProjectionInput): Promise<DurationAssetReviewWriteResult>
  list(input: ListDurationAssetReviewItemsInput): Promise<DurationAssetReviewReadModel>
}

function requireFingerprint(value: string) {
  const normalized = normalizeText(value)
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('duration_asset_review_decision_fingerprint_invalid')
  }
  return normalized
}

export function buildDurationAssetReviewSourceKey(input: BuildDurationAssetReviewSourceKeyInput) {
  return `duration_asset_review:v1:${hashDurationContextPolicyLearningValue({
    reviewKind: input.reviewKind,
    assetKey: input.assetKey,
    artifactKey: normalizeText(input.artifactKey),
    proposalKey: normalizeText(input.proposalKey) || null,
    publicationKey: normalizeText(input.publicationKey) || null,
    decisionFingerprint: requireFingerprint(input.decisionFingerprint),
    scope: input.scope,
  }).slice(0, 40)}`
}

export function buildDurationAssetReviewDecisionFingerprint(
  input: BuildDurationAssetReviewDecisionFingerprintInput,
) {
  return hashDurationContextPolicyLearningValue({
    runtimePayloadHash: hashDurationContextPolicyLearningValue(input.runtimePayload),
    sourceCandidateRefs: uniqueTexts(input.sourceCandidateRefs).sort(),
    sourceEvidenceRefs: uniqueTexts(input.sourceEvidenceRefs).sort(),
    conflictState: input.conflictState,
    replayState: input.replayState,
    policyEvidence: {
      ...input.policyEvidence,
      reasonCodes: uniqueTexts(input.policyEvidence.reasonCodes).sort(),
    },
    reasonCodes: uniqueTexts(input.reasonCodes).sort(),
    monitoringEvidence: input.monitoringEvidence
      ? {
          publicationKey: input.monitoringEvidence.publicationKey,
          monitoringStatus: input.monitoringEvidence.monitoringStatus,
          monitoringMetricsHash: hashDurationContextPolicyLearningValue(input.monitoringEvidence.monitoringMetrics),
          stableDecisionHash: hashDurationContextPolicyLearningValue(input.monitoringEvidence.stableDecision),
        }
      : null,
  })
}
```

`buildDurationAssetReviewPayload` may contain only counts, stable keys, stage, scope, reason codes, source-reference counts, and a monitoring-evidence digest. Reject keys matching `/runtime.?payload|secret|token|credential|raw.?evidence|call.?context/i` and reject serialized payloads over 32768 bytes. The runtime-payload hash is incorporated into `decisionFingerprint`; neither the raw runtime payload nor a separately serialized copy enters the queue row.

- [ ] **Step 4: Implement fixed-query persistence and read models**

`upsertOpen` uses one parameterized statement with this conflict policy:

```sql
INSERT INTO public.duration_asset_review_items (
  scope_level, company_id, project_id, industry_key, asset_key, artifact_key,
  review_kind, decision_fingerprint, source_key, proposal_key, candidate_event_ref, conflict_ref,
  publication_key, reason_codes, review_payload
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::TEXT[],$15::JSONB)
ON CONFLICT (source_key) DO UPDATE
   SET reason_codes = EXCLUDED.reason_codes,
       review_payload = EXCLUDED.review_payload,
       candidate_event_ref = COALESCE(EXCLUDED.candidate_event_ref, duration_asset_review_items.candidate_event_ref),
       conflict_ref = COALESCE(EXCLUDED.conflict_ref, duration_asset_review_items.conflict_ref),
       publication_key = COALESCE(EXCLUDED.publication_key, duration_asset_review_items.publication_key),
       updated_at = NOW()
 WHERE duration_asset_review_items.status = 'open'
RETURNING *;
```

If no row returns, select the existing terminal row and return `terminal_reused`. `resolveByPublication` updates only the locked `source_key` row with `status = 'open'` and persists `resolved_publication_key`, `decision_reason`, `resolution_source`, `reviewed_at`, plus `reviewed_by_user_id` only for `manual_approval`. `resolveOpenByPublicationIdentity` is automatic-only and resolves every open row for the exact review kind, asset, artifact, scope, and proposal/publication lineage so materially superseded fingerprints do not remain actionable after an automatic publication. Both methods reject a reviewer on `automatic_publication`; manual approval requires one. `decide` updates only `status = 'open'`, requires a non-empty decision reason and reviewer, and maps rejection/supersession to the matching resolution source.

The list query uses fixed predicates for company, visible projects, asset, scope, status, reason, project, and age. `projectIds=null` is accepted only as the internal permission-disabled result from `getVisibleProjectIds`; it still requires the exact current-company predicate and is never read from request input. The query may return shared rows through the backend read path, but maps `industry` and `global` items to `canReview=false` and removes source references and review payload before serialization.

- [ ] **Step 5: Run tests, typecheck, and commit**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationAssetReviewQueueService.test.ts
npm exec --workspace=server -- tsc -p tsconfig.json --noEmit
git add server/src/services/durationAssetReviewQueueService.ts server/src/__tests__/durationAssetReviewQueueService.test.ts
git commit -m "feat(duration-assets): add review queue persistence"
```

---

### Task 3: Lifecycle Review Persistence And Atomic Resolution

**Files:**
- Modify: `server/src/services/durationLearningRuntimeLifecycleService.ts`
- Modify: `server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts`
- Create: `server/src/__tests__/durationLearningRuntimeReviewQueue.test.ts`
- Modify: `server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts`
- Modify: `server/src/__tests__/durationBenchmarkProductionChain.test.ts`

**Interfaces:**
- Adds `reviewQueueStore`, `transactionRunner`, and a testable `stableDecisionEvaluator` defaulting to the existing stable policy function to `RunDurationLearningRuntimeLifecycleSweepInput`.
- Adds result counts `reviewItemsOpened`, `reviewItemsReused`, and `reviewItemsResolved`.
- Adds failure phase `review_queue`.
- Produces pure `reviewRequirementForProposal` and `reviewRequirementForMonitoringCandidate` classifiers, both backed by the same decision-fingerprint builder.
- Extends `DurationLearningRuntimeMonitoringCandidate` and its fixed collector SQL with the publication `runtime_payload`, `source_candidate_refs`, and `source_evidence_refs`, so stable-review identity uses the same payload/reference authority as candidate review.
- Produces `findDurationLearningRuntimeProposalForReview`, `findDurationLearningRuntimeMonitoringCandidateForReview`, `reviewRequirementForMonitoringCandidate`, `evaluateDurationLearningRuntimeMonitoringCandidate`, and `proposalCanEnterManualCanary` for Task 4.

- [ ] **Step 1: Write lifecycle REDs**

Use one proposal fixture per exact asset key and assert:

```ts
it.each(DURATION_ASSET_REVIEW_KEYS)('persists one durable item for %s manual fallback', async (assetKey) => {
  const result = await runDurationLearningRuntimeLifecycleSweep({
    candidateProvider: async () => [proposal({ assetKey, conflictCount: 1 })],
    monitoringProvider: async () => [],
    reviewQueueStore,
    transactionRunner,
  })
  expect(reviewQueueStore.upsertOpen).toHaveBeenCalledTimes(1)
  expect(result).toMatchObject({ manualFallback: 1, reviewItemsOpened: 1, failed: 0 })
})

it.each(DURATION_ASSET_REVIEW_KEYS)('persists stable-promotion review and impact atomically for %s', async (assetKey) => {
  const candidate = monitoringCandidate({
    assetKey,
    publicationStage: 'canary',
    runtimePayload: { assetKey, version: 'candidate-v1' },
    sourceCandidateRefs: [`candidate:${assetKey}`],
    sourceEvidenceRefs: [`evidence:${assetKey}`],
  })
  const result = await runDurationLearningRuntimeLifecycleSweep({
    candidateProvider: async () => [],
    monitoringProvider: async () => [candidate],
    stableDecisionEvaluator: () => ({
      targetStage: 'stable',
      stage: 'manual_review',
      autoPromotionAllowed: false,
      manualReviewRequired: true,
      retainPreviousStable: false,
      reasonCodes: ['stable_monitoring_manual_review_required'],
    }),
    reviewQueueStore,
    transactionRunner,
    recordImpact,
  })
  expect(transactionRunner.events).toEqual([
    'transaction:start', 'review:upsert:stable_promotion', 'impact:record', 'transaction:commit',
  ])
  expect(result).toMatchObject({ manualFallback: 1, reviewItemsOpened: 1, failed: 0 })
})

it('fails the lifecycle attempt when review persistence fails', async () => {
  reviewQueueStore.upsertOpen.mockRejectedValueOnce(new Error('queue unavailable'))
  const result = await runDurationLearningRuntimeLifecycleSweep(input)
  expect(result.manualFallback).toBe(0)
  expect(result.candidateCollecting).toBe(0)
  expect(result.failed).toBe(1)
  expect(result.failureRefs).toEqual([expect.objectContaining({ phase: 'review_queue' })])
})

it('publishes and resolves an older open item in the same transaction', async () => {
  await runDurationLearningRuntimeLifecycleSweep(autoEligibleInput)
  expect(transactionRunner.events).toEqual([
    'transaction:start', 'publication:write', 'review:resolve', 'transaction:commit',
  ])
})

it('promotes a project benchmark with impact, benchmark activation, cause segments, and queue resolution in one transaction', async () => {
  const result = await runDurationLearningRuntimeLifecycleSweep(projectBenchmarkStableInput)
  expect(projectBenchmarkStableInput.events).toEqual([
    'transaction:start',
    'impact:record',
    'benchmark-publication:promote',
    'benchmark-current:activate',
    'benchmark-cause-segments:activate',
    'review:resolve-open:automatic_publication',
    'transaction:commit',
  ])
  expect(result).toMatchObject({ stablePromoted: 1, reviewItemsResolved: 1, failed: 0 })
})

it('rolls back impact and benchmark activation when queue resolution fails', async () => {
  reviewQueueStore.resolveOpenByPublicationIdentity.mockRejectedValueOnce(new Error('queue unavailable'))
  await expect(runDurationLearningRuntimeLifecycleSweep(projectBenchmarkStableInput)).resolves.toMatchObject({
    stablePromoted: 0,
    failed: 1,
  })
  expect(projectBenchmarkStableInput.events).toContain('transaction:rollback')
  expect(projectBenchmarkStableInput.events).not.toContain('transaction:commit')
})
```

Also cover insufficient evidence, missing policy evaluation, manual policy decisions, candidate and monitoring fingerprint stability under reordered references, new rows for materially changed evidence, stable-promotion idempotent reuse, automatic resolution without a user ID, transaction rollback, and a queue-write failure after a prior candidate read. Add a focused exact-monitoring resolver test proving one parameterized query, exact publication filtering, caller-supplied `observedAt`, runtime payload/source refs in the mapped candidate, and a publication row lock. The benchmark production-chain test must assert the outer ALS transaction owns the only real `BEGIN`/`COMMIT`; the atomic benchmark writer's nested `BEGIN`/`COMMIT` are no-ops and queue failure rolls back publication stage, current benchmark, and current cause segments together.

- [ ] **Step 2: Run the REDs**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationLearningRuntimeLifecycleService.test.ts src/__tests__/durationLearningRuntimeReviewQueue.test.ts
```

Expected: FAIL on missing queue input/results and unchanged counter-only fallback branches.

- [ ] **Step 3: Add review-requirement classification**

Implement one pure classifier for every expanded proposal:

```ts
export function reviewRequirementForProposal(proposal: DurationLearningRuntimeCandidateProposal) {
  const reasonCodes = [
    ...(proposal.conflictCount > 0 ? ['candidate_conflict_detected'] : []),
    ...(proposal.sampleCount > 0 ? [] : ['candidate_samples_missing']),
    ...(proposal.replayPassed ? [] : ['candidate_replay_not_passed']),
    ...(proposal.sourceCandidateRefs.length > 0 ? [] : ['candidate_reference_missing']),
    ...(proposal.sourceEvidenceRefs.length > 0 ? [] : ['evidence_reference_missing']),
    ...(Object.keys(proposal.runtimePayload).length > 0 ? [] : ['runtime_payload_unavailable']),
    ...(proposal.blockingReasons ?? []),
    ...(proposal.policyEvaluationRequired ? [] : ['automation_policy_evaluation_missing']),
    ...(proposal.automationDecision?.manualReviewRequired ? proposal.automationDecision.reasonCodes : []),
    ...(proposal.automationDecision?.autoPromotionAllowed === true ? [] : ['automatic_eligibility_not_granted']),
  ]
  const normalizedReasonCodes = uniqueTexts(reasonCodes).sort()
  return {
    reviewKind: 'candidate_publication' as const,
    reasonCodes: normalizedReasonCodes,
    decisionFingerprint: buildDurationAssetReviewDecisionFingerprint({
      runtimePayload: proposal.runtimePayload,
      sourceCandidateRefs: proposal.sourceCandidateRefs,
      sourceEvidenceRefs: proposal.sourceEvidenceRefs,
      conflictState: { conflictCount: proposal.conflictCount },
      replayState: { replayPassed: proposal.replayPassed },
      policyEvidence: {
        evaluationRequired: proposal.policyEvaluationRequired === true,
        stage: proposal.automationDecision?.stage ?? null,
        autoPromotionAllowed: proposal.automationDecision?.autoPromotionAllowed ?? null,
        manualReviewRequired: proposal.automationDecision?.manualReviewRequired ?? null,
        reasonCodes: proposal.automationDecision?.reasonCodes ?? [],
        evidence: proposal.automationEvidence ?? null,
      },
      reasonCodes: normalizedReasonCodes,
      monitoringEvidence: null,
    }),
  }
}
```

Persist the item before incrementing `manualFallback` or `candidateCollecting`. A conflict/manual-policy item increments `manualFallback`; other non-eligible items increment `candidateCollecting` only after persistence succeeds.

Extend the monitoring collector select with `publication.runtime_payload`, `publication.source_candidate_refs`, and `publication.source_evidence_refs`; map them into the monitoring candidate without exposing them through the queue read model. Add `reviewRequirementForMonitoringCandidate(candidate, evaluation, stableDecision)`. It returns `reviewKind='stable_promotion'` and fingerprints the runtime payload, sorted source references, publication identity, source automation decision/policy evidence, complete monitoring metrics, stable decision, and normalized reason codes. Default `stableDecisionEvaluator` to `stableAutomationDecision`; tests inject only deterministic policy outcomes, not persistence behavior. When stable promotion requires manual review, call `reviewQueueStore.upsertOpen` and `recordImpact` inside one `transactionRunner` callback before incrementing counters. This applies to all six asset families; no family remains counter-only.

```ts
export type DurationLearningRuntimeMonitoringEvaluation = ReturnType<typeof evaluateMonitoring>
export type DurationLearningRuntimeStableDecision = ReturnType<typeof stableAutomationDecision>

export function reviewRequirementForMonitoringCandidate(
  candidate: DurationLearningRuntimeMonitoringCandidate,
  evaluation: DurationLearningRuntimeMonitoringEvaluation,
  stableDecision: DurationLearningRuntimeStableDecision,
) {
  const sourceDecision = record(candidate.sourceAutomationDecision)
  const sourceObserved = record(sourceDecision.observed)
  const reasonCodes = uniqueTexts([
    ...evaluation.reasons,
    ...stableDecision.reasonCodes,
  ]).sort()
  return {
    reviewKind: 'stable_promotion' as const,
    reasonCodes,
    decisionFingerprint: buildDurationAssetReviewDecisionFingerprint({
      runtimePayload: candidate.runtimePayload,
      sourceCandidateRefs: candidate.sourceCandidateRefs,
      sourceEvidenceRefs: candidate.sourceEvidenceRefs,
      conflictState: {
        conflictCount: nonNegativeInteger(sourceObserved.conflictCount ?? sourceObserved.conflict_count),
      },
      replayState: {
        replayPassed: typeof (sourceObserved.replayPassed ?? sourceObserved.replay_passed) === 'boolean'
          ? Boolean(sourceObserved.replayPassed ?? sourceObserved.replay_passed)
          : null,
      },
      policyEvidence: {
        evaluationRequired: true,
        stage: stableDecision.stage,
        autoPromotionAllowed: stableDecision.autoPromotionAllowed,
        manualReviewRequired: stableDecision.manualReviewRequired,
        reasonCodes: stableDecision.reasonCodes,
        evidence: sourceDecision,
      },
      reasonCodes,
      monitoringEvidence: {
        publicationKey: candidate.publicationKey,
        monitoringStatus: evaluation.status,
        monitoringMetrics: evaluation.metrics,
        stableDecision,
      },
    }),
  }
}
```

Export one production evaluator so the scheduler and manual decision path cannot drift:

```ts
export function evaluateDurationLearningRuntimeMonitoringCandidate(
  candidate: DurationLearningRuntimeMonitoringCandidate,
  stableDecisionEvaluator: typeof stableAutomationDecision = stableAutomationDecision,
) {
  const evaluation = evaluateMonitoring(candidate)
  return {
    evaluation,
    stableDecision: evaluation.status === 'passed' && candidate.publicationStage === 'canary'
      ? stableDecisionEvaluator(candidate, evaluation.metrics)
      : null,
  }
}
```

The lifecycle uses this wrapper instead of calling the two private functions separately. Add this exact resolver interface:

```ts
export async function findDurationLearningRuntimeMonitoringCandidateForReview(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  publicationKey: string
  observedAt: string
}): Promise<DurationLearningRuntimeMonitoringCandidate | null>
```

Refactor the fixed monitoring SQL builder to support two compile-time modes, `'batch'` and `'exact_for_review'`. The exact mode accepts only `publicationKey` and `observedAt` parameters, applies the same observation/network/accuracy subqueries as the scheduled collector, filters one canary publication, calculates elapsed time from `observedAt`, selects `runtime_payload`, `source_candidate_refs`, `source_evidence_refs`, and `automation_decision`, and ends with `FOR UPDATE OF publication`. It must return at most one candidate and must not scan a cursor batch or accept caller-provided SQL fragments.

- [ ] **Step 4: Make publication and queue resolution atomic**

Default `transactionRunner` to `withDatabaseTransaction(async () => work())`. In tests or custom query adapters, require explicit injection instead of silently opening a real database transaction. Candidate automatic publication runs `persistDurationLearningRuntimePublication` followed by `resolveOpenByPublicationIdentity({ resolutionSource: 'automatic_publication', reviewerUserId: null, decisionReason: 'automatic_candidate_publication' })` in one callback. Stable automatic promotion runs `recordImpact`, the correct promotion writer, and automatic queue resolution in one callback.

For stable promotion, use this exact writer selection inside the outer transaction:

```ts
const promotion = candidate.assetKey === 'base_duration_benchmark'
  && candidate.scope.level === 'project'
  ? await promoteBenchmarkCanary({
      publicationKey: candidate.publicationKey,
      promotedAt: observedAt,
    })
  : await promoteCanary({
      queryExec,
      publicationKey: candidate.publicationKey,
      promotedAt: observedAt,
    })
```

`promoteDurationBenchmarkRuntimeCanaryAtomically` must remain the project-benchmark writer. Because `database.getClient()` returns an ALS nested client, calling it inside `withDatabaseTransaction` keeps publication promotion, benchmark `is_current` activation, cause-segment activation, impact recording, and queue resolution under the outer commit. Do not replace it with generic `promoteDurationLearningRuntimeCanary` and do not add a second benchmark activation path. A rollback must leave the review item open and publication/benchmark/cause-segment state unchanged.

Export `proposalCanEnterManualCanary`, which retains hard safety floors (samples, replay, source references, non-empty runtime payload, and zero blocking reasons/conflicts) but does not require automatic policy approval. Export a bounded proposal resolver that scans lifecycle candidate batches and matches the deterministic review source key.

- [ ] **Step 5: Run tests, typecheck, and commit**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationLearningRuntimeLifecycleService.test.ts src/__tests__/durationLearningRuntimeReviewQueue.test.ts src/__tests__/durationLearningRuntimePublicationService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/durationBenchmarkProductionChain.test.ts
npm exec --workspace=server -- tsc -p tsconfig.json --noEmit
git add server/src/services/durationLearningRuntimeLifecycleService.ts server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts server/src/__tests__/durationLearningRuntimeReviewQueue.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationBenchmarkProductionChain.test.ts
git commit -m "fix(duration-assets): persist lifecycle review decisions"
```

---

### Task 4: Governed Decisions And Admin API

**Files:**
- Create: `server/src/services/durationAssetReviewDecisionService.ts`
- Create: `server/src/routes/duration-assets.ts`
- Modify: `server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts`
- Modify: `server/src/routes/algorithm-seeds.ts`
- Modify: `server/src/index.ts`
- Create: `server/src/__tests__/durationAssetReviewDecisionService.test.ts`
- Create: `server/src/__tests__/durationAssetReviewStableApproval.test.ts`
- Create: `server/src/__tests__/durationAssetsRoute.test.ts`
- Modify: `server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts`
- Modify: `server/src/__tests__/algorithmSeedRoutes.test.ts`

**Interfaces:**
- Produces `decideDurationAssetReviewItem(input)`.
- Exposes `GET /api/admin/duration-assets/review-items`.
- Extends existing `POST /api/planning/algorithm-seeds/rule-assets/governance-workbench/operations` with `action='duration_asset_review_decision'` and `assetType='duration_learning_runtime'`.
- Reuses `areRuleAssetRuntimeActionsEnabled`, `executeAlgorithmAssetGovernanceWorkbenchOperation`, `persistDurationLearningRuntimePublication`, `recordDurationLearningRuntimeImpact`, `promoteDurationLearningRuntimeCanary`, `promoteDurationBenchmarkRuntimeCanaryAtomically`, the candidate/monitoring review resolvers and classifiers from the lifecycle service, and the queue store.

- [ ] **Step 1: Write decision and route REDs**

Cover these exact behaviors:

```ts
const approveInput: DecideDurationAssetReviewItemInput = {
  reviewItemId: 'review-1',
  decision: 'approve',
  decisionReason: 'validated by governed reviewer',
  authority: {
    kind: 'company_admin',
    companyId: 'company-1',
    authorizedProjectIds: ['project-1'],
    reviewerUserId: 'user-1',
  },
  queueStore,
  transactionRunner: async (work) => work(),
  persistPublication: persistDurationLearningRuntimePublication,
  recordImpact: recordDurationLearningRuntimeImpact,
  promoteCanary: promoteDurationLearningRuntimeCanary,
  promoteBenchmarkCanary: promoteDurationBenchmarkRuntimeCanaryAtomically,
  findMonitoringCandidate: findDurationLearningRuntimeMonitoringCandidateForReview,
  evaluateMonitoringCandidate: evaluateDurationLearningRuntimeMonitoringCandidate,
  buildMonitoringReviewRequirement: reviewRequirementForMonitoringCandidate,
}

const sharedScopeInput: DecideDurationAssetReviewItemInput = {
  ...approveInput,
  reviewItemId: 'review-global',
}

it('approves a hard-safe candidate through the existing publication writer', async () => {
  const result = await decideDurationAssetReviewItem(approveInput)
  expect(persistDurationLearningRuntimePublication).toHaveBeenCalledWith(expect.objectContaining({
    stage: 'canary',
    automationDecision: expect.objectContaining({ decision: 'manual_canary', reviewItemId: 'review-1' }),
  }))
  expect(queueStore.resolveByPublication).toHaveBeenCalledWith(expect.objectContaining({
    resolutionSource: 'manual_approval',
    reviewerUserId: 'user-1',
    decisionReason: 'validated by governed reviewer',
  }))
  expect(result.status).toBe('resolved_by_publication')
})

it('keeps insufficient-evidence and conflict items open when approval is not hard-safe', async () => {
  await expect(decideDurationAssetReviewItem(approveInput))
    .rejects.toMatchObject({ code: 'DURATION_ASSET_REVIEW_NOT_PUBLICATION_READY', status: 409 })
  expect(persistDurationLearningRuntimePublication).not.toHaveBeenCalled()
})

it('denies a company admin mutation of global and industry items', async () => {
  await expect(decideDurationAssetReviewItem(sharedScopeInput))
    .rejects.toMatchObject({ code: 'DURATION_ASSET_REVIEW_SHARED_SCOPE_READ_ONLY', status: 403 })
})

it('uses the atomic writer for project benchmark stable approval', async () => {
  queueStore.loadForUpdate.mockResolvedValueOnce(projectBenchmarkStableReviewItem)
  await decideDurationAssetReviewItem(approveInput)
  expect(findDurationLearningRuntimeMonitoringCandidateForReview).toHaveBeenCalledWith(expect.objectContaining({
    publicationKey: projectBenchmarkStableReviewItem.publicationKey,
  }))
  expect(recordDurationLearningRuntimeImpact).toHaveBeenCalledWith(expect.objectContaining({
    publicationKey: projectBenchmarkStableReviewItem.publicationKey,
    monitoringStatus: 'passed',
    metrics: expect.objectContaining({
      manualApproval: expect.objectContaining({ reviewItemId: projectBenchmarkStableReviewItem.id }),
    }),
  }))
  expect(promoteDurationBenchmarkRuntimeCanaryAtomically).toHaveBeenCalledWith(expect.objectContaining({
    publicationKey: projectBenchmarkStableReviewItem.publicationKey,
  }))
  expect(promoteDurationLearningRuntimeCanary).not.toHaveBeenCalled()
  expect(transactionEvents).toEqual([
    'transaction:start',
    'review:lock',
    'monitoring:lock-and-read',
    'impact:record:passed',
    'benchmark:promote-and-activate-causes',
    'review:resolve:manual_approval',
    'transaction:commit',
  ])
})

it('rejects stale stable approval before impact or promotion', async () => {
  queueStore.loadForUpdate.mockResolvedValueOnce(projectBenchmarkStableReviewItem)
  buildMonitoringReviewRequirement.mockReturnValueOnce({
    ...currentStableRequirement,
    decisionFingerprint: 'f'.repeat(64),
  })
  await expect(decideDurationAssetReviewItem(approveInput)).rejects.toMatchObject({
    code: 'DURATION_ASSET_REVIEW_STALE',
    status: 409,
  })
  expect(recordDurationLearningRuntimeImpact).not.toHaveBeenCalled()
  expect(promoteDurationBenchmarkRuntimeCanaryAtomically).not.toHaveBeenCalled()
})

```

`durationAssetReviewStableApproval.test.ts` must use the real decision service, real monitoring resolver/evaluator/classifier, real impact writer, and a transaction-aware fake SQL client. It must prove current-fingerprint success order, stale-fingerprint zero-write rejection, pending/failed monitoring zero-write rejection, generic stable promotion, project-benchmark atomic promotion with cause activation, and rollback of impact/promotion/queue resolution when the final queue update fails.

Route tests must prove current company membership is the authority, a legacy JWT `globalRole=company_admin` is denied when membership is not admin, cross-company projects fail closed, shared rows are serialized as read-only, request-body `authority`, `visibleProjectIds`, and `authorizedProjectIds` are ignored, and the existing workbench operation route gates approval without blocking reject/supersede.

- [ ] **Step 2: Run the REDs**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationAssetReviewDecisionService.test.ts src/__tests__/durationAssetReviewStableApproval.test.ts src/__tests__/durationAssetsRoute.test.ts
```

Expected: FAIL because the service, read route, and workbench decision delegation do not exist.

- [ ] **Step 3: Implement the thin decision adapter**

Use exact input and decision types in the decision adapter:

```ts
export type DurationAssetReviewDecision = 'approve' | 'reject' | 'supersede'

export type DurationAssetReviewDecisionAuthority =
  { kind: 'company_admin'; companyId: string; authorizedProjectIds: string[] | null; reviewerUserId: string }

export interface DecideDurationAssetReviewItemInput {
  reviewItemId: string
  decision: DurationAssetReviewDecision
  decisionReason: string
  authority: DurationAssetReviewDecisionAuthority
  queryExec?: DurationLearningRuntimePublicationQueryExec
  queueStore?: DurationAssetReviewQueueStore
  transactionRunner?: DurationAssetReviewTransactionRunner
  persistPublication?: typeof persistDurationLearningRuntimePublication
  recordImpact?: typeof recordDurationLearningRuntimeImpact
  promoteCanary?: typeof promoteDurationLearningRuntimeCanary
  promoteBenchmarkCanary?: typeof promoteDurationBenchmarkRuntimeCanaryAtomically
  findMonitoringCandidate?: typeof findDurationLearningRuntimeMonitoringCandidateForReview
  evaluateMonitoringCandidate?: typeof evaluateDurationLearningRuntimeMonitoringCandidate
  buildMonitoringReviewRequirement?: typeof reviewRequirementForMonitoringCandidate
  observedAt?: string
}
```

Load the item `FOR UPDATE` inside the transaction. Reject non-open rows unless an identical prior approval can be returned idempotently. Company-admin authority accepts only current-company company/project rows; project rows must be in the server-provided `authorizedProjectIds` when that list is non-null. Reject `industry` and `global` unconditionally. For `reject` and `supersede`, update only the queue row with the matching manual resolution source, reviewer ID, reason, and timestamp.

For candidate approval, resolve the current proposal, recompute `reviewRequirementForProposal`, require its fingerprint to equal the locked queue item, call `proposalCanEnterManualCanary`, then call `persistDurationLearningRuntimePublication`.

For stable approval, perform this sequence inside the same outer `withDatabaseTransaction` callback:

1. Call `findDurationLearningRuntimeMonitoringCandidateForReview({ queryExec, publicationKey, observedAt })`; its fixed SQL locks the exact canary publication row and returns current runtime payload, source refs, automation decision, and monitoring evidence.
2. Require asset, artifact, and scope identity to match the locked queue item.
3. Call `evaluateDurationLearningRuntimeMonitoringCandidate`; require `evaluation.status='passed'` and a non-null stable decision. Pending or failed monitoring returns `DURATION_ASSET_REVIEW_NOT_PUBLICATION_READY` without impact, promotion, or queue mutation.
4. Call `reviewRequirementForMonitoringCandidate` with the returned evaluation/stable decision; require `reviewKind='stable_promotion'`, `stableDecision.manualReviewRequired=true`, and exact equality with `item.decisionFingerprint`. A mismatch returns `DURATION_ASSET_REVIEW_STALE` before any write; the lifecycle will create/resolve the item for the new evidence state.
5. Call `recordDurationLearningRuntimeImpact` with `monitoringStatus='passed'`, the current metrics/stable decision, and bounded `manualApproval` metadata containing review item ID, reviewer user ID, decision reason, and observed time. Require `impact_recorded`.
6. Call `promoteDurationBenchmarkRuntimeCanaryAtomically` only for project-scoped `base_duration_benchmark`; call `promoteDurationLearningRuntimeCanary` for the other valid stable items. The promotion must return promoted or idempotently already promoted.
7. Call `resolveByPublication` with `resolutionSource='manual_approval'`, the real reviewer user ID, submitted reason, observed time, and resulting publication key.

Because the benchmark writer reuses the active ALS connection, impact state, publication promotion, benchmark current-row activation, cause-segment activation, and queue resolution share one real commit. Any failure rolls all of them back.

- [ ] **Step 4: Delegate commands through the existing workbench operation service**

Extend the existing unions with exact new literals:

```ts
export type AlgorithmAssetGovernanceWorkbenchOperationAction =
  | 'release_exit_handoff'
  | 'manual_review_handoff'
  | 'manual_conflict_review'
  | 'manual_review_approval'
  | 'runtime_apply'
  | 'runtime_impact_monitoring'
  | 'runtime_rollback_execution'
  | 'runtime_consumer_observation'
  | 'runtime_engine_evidence'
  | 'runtime_saved_outcome'
  | 'runtime_recommendation_adopt'
  | 'runtime_recommendation_decline'
  | 'runtime_rollback'
  | 'duration_asset_review_decision'

export type AlgorithmAssetGovernanceWorkbenchAssetType =
  | 'learnable_parameter'
  | 'algorithm_seed'
  | 'policy_template'
  | 'forecast_residual_overlay'
  | 'cold_start_baseline'
  | 'sample_health'
  | 'dependency_rule'
  | 'template_seed'
  | 'construction_organization_plan_network'
  | 'duration_learning_runtime'
```

Add `reviewItemId`, `reviewDecision`, and `decisionNotes` to the public operation fields, plus internal-only `authorizedProjectIds` to `AlgorithmAssetGovernanceWorkbenchOperationInput`. Add an injectable `decideDurationAssetReviewItem` dependency. The branch validates `domainWriterKey === 'duration_asset_review_decision_service'`, constructs only `authority.kind='company_admin'` from current membership and the server-resolved project list, delegates exactly once, and preserves `writesRuntimeDirectly=false`, `workbenchDoesNotGrantPublishRights=true`, and `delegatedToDomainWriter=true`. There is no operator authority variant.

In `algorithm-seeds.ts`, treat only `reviewDecision='approve'` as a high-risk runtime action subject to `areRuleAssetRuntimeActionsEnabled()`. Reject and supersede remain queue-only decisions. Continue requiring current-company admin membership for every operation. Resolve `getVisibleProjectIds(req.user.id, req.user.globalRole, companyId)` server-side and pass its result after the request-body spread as `authorizedProjectIds`, so caller-provided visibility fields can never win.

```ts
const authorizedProjectIds = await getVisibleProjectIds(req.user.id, req.user.globalRole, companyId)
const result = await executeAlgorithmAssetGovernanceWorkbenchOperation({
  ...req.body,
  companyId,
  requestedByUserId: req.user.id,
  authorizedProjectIds,
  queryExec: executeSQL,
})
```

- [ ] **Step 5: Implement read-route validation and authority**

Use Zod for queue filters only. The new duration-assets route has no mutation handler:

```ts
const reviewListSchema = z.object({
  assetKey: z.enum(DURATION_ASSET_REVIEW_KEYS).optional(),
  scope: z.enum(['project', 'company', 'industry', 'global']).optional(),
  projectId: z.string().uuid().optional(),
  reason: z.string().trim().max(120).optional(),
  status: z.enum(['open', 'approved', 'rejected', 'superseded', 'resolved_by_publication']).optional(),
  age: z.enum(['all', '24h', '7d', '30d']).optional(),
})
```

Resolve `getCurrentCompanyMembership`, require `company_members.role === 'company_admin'`, and resolve visible project IDs with `getVisibleProjectIds`. Mount the read router at `/api/admin/duration-assets`. The read route may include sanitized shared rows, but never source references or mutation capability. The operation endpoint returns stable 403/409 codes from the delegated decision service and never maps persistence/publication failures to empty success.

- [ ] **Step 6: Run tests, typecheck, and commit**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationAssetReviewDecisionService.test.ts src/__tests__/durationAssetReviewStableApproval.test.ts src/__tests__/durationAssetsRoute.test.ts src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts src/__tests__/algorithmSeedRoutes.test.ts src/__tests__/durationAlgorithmAccuracyRoute.test.ts
npm exec --workspace=server -- tsc -p tsconfig.json --noEmit
git add server/src/services/durationAssetReviewDecisionService.ts server/src/routes/duration-assets.ts server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts server/src/routes/algorithm-seeds.ts server/src/index.ts server/src/__tests__/durationAssetReviewDecisionService.test.ts server/src/__tests__/durationAssetReviewStableApproval.test.ts server/src/__tests__/durationAssetsRoute.test.ts server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts server/src/__tests__/algorithmSeedRoutes.test.ts
git commit -m "feat(duration-assets): add governed review decisions"
```

---

### Task 5: Unified Duration Assets Administration Page

**Files:**
- Create: `client/src/services/durationAssetsApi.ts`
- Modify: `client/src/services/ruleAssetGovernanceWorkbenchApi.ts`
- Create: `client/src/pages/DurationAssetsAdmin.tsx`
- Create: `client/src/pages/__tests__/DurationAssetsAdmin.test.tsx`
- Modify: `client/src/pages/DurationAccuracyAdmin.tsx`
- Modify: `client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx`
- Modify: `client/src/pages/__tests__/DurationAccuracyAdmin.test.tsx`
- Modify: `client/src/pages/__tests__/RuleAssetGovernanceWorkbenchAdmin.test.tsx`
- Create: `client/src/services/__tests__/durationAssetsApi.test.ts`
- Modify: `client/src/services/__tests__/ruleAssetGovernanceWorkbenchApi.test.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/config/navigation.ts`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/components/CommandPalette.tsx`
- Modify: `client/src/config/v14231ReadinessRoutes.ts`

**Interfaces:**
- Adds route `/admin/duration-assets?tab=queue|published|monitoring|accuracy`.
- Keeps old admin URLs and page behavior intact; each legacy page links to the corresponding new tab.
- Consumes the new queue API and existing `/api/admin/duration-accuracy/summary` and `/governance-read-model` endpoints.
- Before editing UI code, read `project-ui/skills/workbuddy-ui-implementation/SKILL.md`, `design-system/workbuddy/MASTER.md`, and `project-ui/index/source-map.json`; use the approved Workstream 2 specification as the page contract and do not create a parallel approval foundation. Immutable base `c66c791` has no tracked `project-ui/index/v15-page-delivery-registry.json`; if that registry appears after an approved rebase, read it before editing rather than inventing a replacement in this workstream.

- [ ] **Step 1: Write API and page REDs**

The API test must preserve camelCase DTOs and exact filters. The page test must cover:

```ts
function renderAdmin(path = '/admin/duration-assets') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/duration-assets" element={<DurationAssetsAdmin />} />
      </Routes>
    </MemoryRouter>,
  )
}

function configureState(state: 'loading' | 'empty' | 'error' | 'permission' | 'stale') {
  mocks.queueState = state
  mocks.generatedAt = state === 'stale'
    ? '2026-07-23T00:00:00.000Z'
    : '2026-07-23T08:00:00.000Z'
}

it('renders queue, published, monitoring, and accuracy tabs from governed read models', async () => {
  renderAdmin('/admin/duration-assets?tab=queue')
  expect(await screen.findByRole('heading', { name: '工期资产治理' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '审核队列' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('base_duration_benchmark')).toBeInTheDocument()
})

it('keeps shared items visible but read-only', async () => {
  renderAdmin('/admin/duration-assets?tab=queue')
  expect(await screen.findByText('全局只读')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '批准' })).not.toBeInTheDocument()
})

it.each(['loading', 'empty', 'error', 'permission', 'stale'])('renders the %s state', async (state) => {
  configureState(state)
  renderAdmin('/admin/duration-assets')
  expect(await screen.findByTestId(`duration-assets-${state}`)).toBeInTheDocument()
})
```

Also cover filters for family/scope/project/reason/status/age, read-only rows, approve/reject/supersede confirmation dialogs, disabled/loading commands, retryable toast errors, successful refresh, keyboard tab navigation, and mobile table overflow.

- [ ] **Step 2: Run the REDs**

```powershell
npm exec --workspace=client -- vitest run --config vitest.config.ts --configLoader runner src/services/__tests__/durationAssetsApi.test.ts src/services/__tests__/ruleAssetGovernanceWorkbenchApi.test.ts src/pages/__tests__/DurationAssetsAdmin.test.tsx
```

Expected: FAIL because the API client, page, and route do not exist.

- [ ] **Step 3: Implement the API client**

Define exact public types including `canReview`, `approvalReady`, sanitized nullable references, `decisionFingerprint`, `resolutionSource`, `reviewedByUserId`, `decisionReason`, `generatedAt`, and filter/status unions. Use `apiGet` with `runtimeCache: 'off'` for queue reads. For decisions, call the existing `executeRuleAssetGovernanceWorkbenchOperation` client with:

```ts
{
  action: 'duration_asset_review_decision',
  assetType: 'duration_learning_runtime',
  domainWriterKey: 'duration_asset_review_decision_service',
  evidenceToken: item.sourceKey,
  reviewItemId: item.id,
  reviewDecision: decision,
  decisionNotes,
}
```

Do not create a second mutation URL and do not derive company or authority client-side.

- [ ] **Step 4: Implement the page shell and states**

Use `Tabs`, shared `Table`, `Badge`, `Select`, `Input`, `ConfirmActionDialog`, `Button`, `Alert`, Lucide icons, and `useToast`. Keep sections unframed except the actual queue/table tools. The queue tab owns commands; published, monitoring, and accuracy tabs render the existing backend-owned rows without recomputing metrics.

Treat a response older than five minutes as stale:

```ts
const stale = readTimestamp(model?.generatedAt) !== null
  && Date.now() - readTimestamp(model?.generatedAt)! > 5 * 60 * 1000
```

On decision failure, keep the item in place and show a destructive toast. On success, close the dialog, show a success toast, and refetch all affected tabs.

- [ ] **Step 5: Add route, navigation, and legacy-page compatibility**

Add the new lazy import and route in `App.tsx` while retaining both existing route elements. Add explicit command links in the legacy page headers:

```tsx
<Link to="/admin/duration-assets?tab=accuracy">打开统一工期资产页</Link>
<Link to="/admin/duration-assets?tab=published">查看工期资产发布</Link>
```

Add one company-admin-only navigation item with the Lucide `DatabaseZap` icon. Update Sidebar and CommandPalette filters so regular members do not see it, while direct route access still renders a permission state from the API response.

- [ ] **Step 6: Run tests, typecheck, and commit**

```powershell
npm exec --workspace=client -- vitest run --config vitest.config.ts --configLoader runner src/services/__tests__/durationAssetsApi.test.ts src/services/__tests__/ruleAssetGovernanceWorkbenchApi.test.ts src/pages/__tests__/DurationAssetsAdmin.test.tsx src/pages/__tests__/DurationAccuracyAdmin.test.tsx src/pages/__tests__/RuleAssetGovernanceWorkbenchAdmin.test.tsx
npm exec --workspace=client -- tsc -p tsconfig.json --noEmit
git add client/src/services/durationAssetsApi.ts client/src/services/ruleAssetGovernanceWorkbenchApi.ts client/src/services/__tests__/ruleAssetGovernanceWorkbenchApi.test.ts client/src/pages/DurationAssetsAdmin.tsx client/src/pages/__tests__/DurationAssetsAdmin.test.tsx client/src/pages/DurationAccuracyAdmin.tsx client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx client/src/pages/__tests__/DurationAccuracyAdmin.test.tsx client/src/pages/__tests__/RuleAssetGovernanceWorkbenchAdmin.test.tsx client/src/services/__tests__/durationAssetsApi.test.ts client/src/App.tsx client/src/config/navigation.ts client/src/components/layout/Sidebar.tsx client/src/components/CommandPalette.tsx client/src/config/v14231ReadinessRoutes.ts
git commit -m "feat(duration-assets): add unified administration page"
```

---

### Task 6: Complete Benchmark Provenance In Suggestions

**Files:**
- Modify: `server/src/services/durationLearningRuntimeLifecycleService.ts`
- Modify: `server/src/services/durationLearningAssetAtomicStoreService.ts`
- Modify: `server/src/services/durationSuggestionService.ts`
- Modify: `server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts`
- Modify: `server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts`
- Modify: `server/src/__tests__/durationLearningRuntimePublicationService.test.ts`
- Modify: `server/src/__tests__/durationBenchmarkProductionChain.test.ts`
- Modify: `server/src/__tests__/durationSuggestionService.test.ts`
- Modify: `client/src/services/durationSuggestionsApi.ts`
- Modify: `client/src/services/__tests__/durationSuggestionsApi.test.ts`
- Modify: `client/src/components/planning/DurationSuggestionTooltip.tsx`
- Modify: `client/src/components/planning/__tests__/DurationSuggestionTooltip.test.tsx`
- Modify: `client/src/__tests__/contracts/durationSurface.contract.test.ts`

**Interfaces:**
- Adds scalar summary fields `benchmarkGeneratedAt`, `benchmarkAsOf`, `benchmarkWindowStart`, `benchmarkVersion`, `benchmarkSampleCount`, `benchmarkDayBasis`, and `benchmarkScope`.
- Adds authoritative `benchmarkProvenance` with `mode='single'|'blended'` and one entry for every benchmark candidate actually used.
- Adds `benchmarkProvenanceAvailability='available'|'partial'|'unavailable'`, `benchmarkProvenanceReasonCodes`, and `benchmarkProvenanceUnavailableReason`.
- Replaces internal `BenchmarkScope='project'|'company'|'system'` with exact `project|company|industry|global`; public scalar scope additionally permits `mixed`.
- Adds `benchmarkVersion` to every project and aggregate runtime benchmark payload and validates it during project benchmark activation.

- [ ] **Step 1: Write production-chain and suggestion REDs**

Runtime/persistence tests must prove:

```ts
expect(projectBenchmarkProposal.runtimePayload).toMatchObject({
  benchmarkId: 'benchmark-1',
  benchmarkVersion: 'candidate:2026-07-01:abc123',
})

expect(industryAggregateProposal.runtimePayload).toMatchObject({
  benchmarkVersion: expect.stringMatching(/^aggregate:industry:[a-f0-9]{16}$/),
  aggregateProvenance: expect.objectContaining({
    scopeLevel: 'industry',
    sourceBenchmarkVersions: ['candidate:2026-06-01:a', 'candidate:2026-06-15:b'],
  }),
})

await expect(promoteDurationBenchmarkRuntimeCanaryAtomically({ publicationKey: 'publication-1' }))
  .rejects.toThrow('duration benchmark activation version mismatch')
```

Suggestion tests must cover a persisted row, an exact runtime publication, an industry runtime publication, a current cause segment, and a mixed blend:

```ts
expect(suggestion).toMatchObject({
  benchmarkGeneratedAt: '2026-07-01T08:00:00.000Z',
  benchmarkAsOf: '2026-06-30T23:59:59.000Z',
  benchmarkWindowStart: '2026-04-01T00:00:00.000Z',
  benchmarkVersion: 'v7',
  benchmarkSampleCount: 24,
  benchmarkDayBasis: 'construction_production_day',
  benchmarkScope: 'company',
  benchmarkProvenanceAvailability: 'available',
  benchmarkProvenanceReasonCodes: [],
  benchmarkProvenance: {
    mode: 'single',
    entries: [expect.objectContaining({
      source: 'persisted_benchmark',
      benchmarkId: 'benchmark-1',
      benchmarkVersion: 'v7',
      scope: 'company',
      generatedAt: '2026-07-01T08:00:00.000Z',
      sourceAsOf: '2026-06-30T23:59:59.000Z',
      sourceWindowStart: '2026-04-01T00:00:00.000Z',
      sampleCount: 24,
      dayBasis: 'construction_production_day',
      calendarRef: 'calendar-1',
      calendarVersion: 'calendar-v3',
      causeSegment: null,
      blendWeight: null,
      availability: 'available',
      reasonCodes: [],
    })],
  },
})
```

For a blend, assert `benchmarkScope='mixed'`, `benchmarkVersion=null`, and two ordered provenance entries with their exact `project` and `industry` scopes and normalized applied weights. For a cause segment, assert the entry carries `causeCode`, `taxonomyVersion`, segment timestamps, segment calendar identity, and the parent benchmark version. Add separate missing-version, missing-window, wrong-day-basis, and missing-calendar cases. Freeze `Date.now` and assert no missing field is replaced by request/response/task time.

Client tooltip tests must assert single and blended text, including `数据截至 2026/06/30`, `公司基准 · 24 个样本`, exact source rows for mixed scope, and `基准数据来源不完整` or `基准数据时间不可用` for partial/unavailable states. The retired frozen-reference markers remain forbidden.

- [ ] **Step 2: Run the REDs**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationLearningRuntimeLifecycleService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/durationLearningRuntimePublicationService.test.ts src/__tests__/durationBenchmarkProductionChain.test.ts src/__tests__/durationSuggestionService.test.ts
npm exec --workspace=client -- vitest run --config vitest.config.ts --configLoader runner src/services/__tests__/durationSuggestionsApi.test.ts src/components/planning/__tests__/DurationSuggestionTooltip.test.tsx src/__tests__/contracts/durationSurface.contract.test.ts
```

Expected: FAIL because runtime benchmark payloads omit version, runtime scope is collapsed to `system`, and the public DTO has no complete candidate-set provenance.

- [ ] **Step 3: Add benchmark version to runtime production and activation**

In `benchmarkProposalFromRow`, read `row.benchmark_version`, add `benchmark_version_required` to blocking reasons when absent, and include `benchmarkVersion` in `runtimePayload`. In `aggregateRuntimePayload`, collect sorted unique source benchmark versions and derive a deterministic aggregate version:

```ts
const sourceBenchmarkVersions = uniqueTexts(proposals.map((proposal) => (
  text(proposal.runtimePayload.benchmarkVersion ?? proposal.runtimePayload.benchmark_version)
))).sort()
const sourceAsOf = aggregatePayloadTimestamp(proposals, ['sourceAsOf', 'source_as_of'], 'latest')
const benchmarkVersion = `aggregate:${scope.level}:${hashDurationContextPolicyLearningValue({
  scope,
  sourceBenchmarkIds,
  sourceBenchmarkVersions,
  sourceAsOf,
}).slice(0, 16)}`
```

Persist `sourceBenchmarkVersions` in `aggregateProvenance`. In `promoteDurationBenchmarkRuntimeCanaryAtomically`, require runtime `benchmarkVersion` and exact equality with the locked `duration_benchmarks.benchmark_version` before publication promotion or current/cause-segment mutation. Existing rows and migration 324 remain unchanged.

- [ ] **Step 4: Build exact candidate-set provenance**

Add `benchmark_version` to both persisted benchmark selects and `DurationBenchmarkRow`. Change `DurationBenchmarkCandidate.scope` to `DurationLearningRuntimeScope['level']`; map runtime publications directly from `publication.scopeLevel`, and map unscoped persisted rows to `global`. Add exact `standard_work_duration_seed+industry_history_sample` and `standard_work_duration_seed+global_history_sample` calibration-source literals, retain `mixed_history_sample` only for genuinely multi-scope blends, and update scope consistency, usability floors, labels, contracts, and tests so `industry` and `global` never collapse to `system`.

Add these public types:

```ts
export type BenchmarkProvenanceReasonCode =
  | 'benchmark_provenance_missing'
  | 'benchmark_version_missing'
  | 'benchmark_generated_at_missing'
  | 'benchmark_source_as_of_missing'
  | 'benchmark_source_window_start_missing'
  | 'benchmark_sample_count_invalid'
  | 'benchmark_day_basis_unavailable'
  | 'benchmark_scope_unavailable'
  | 'benchmark_calendar_identity_missing'
  | 'benchmark_runtime_publication_key_missing'
  | 'benchmark_cause_identity_missing'
  | 'benchmark_blend_weight_invalid'

export interface BenchmarkProvenanceEntry {
  source: 'persisted_benchmark' | 'runtime_publication' | 'cause_segment'
  benchmarkId: string | null
  publicationKey: string | null
  benchmarkVersion: string | null
  scope: 'project' | 'company' | 'industry' | 'global' | null
  generatedAt: string | null
  sourceAsOf: string | null
  sourceWindowStart: string | null
  sampleCount: number | null
  dayBasis: 'construction_production_day' | null
  calendarRef: string | null
  calendarVersion: string | null
  aggregateCalendarIdentities: Array<{ calendarRef: string; calendarVersion: string }>
  causeSegment: null | { causeCode: StructuredCauseCode; taxonomyVersion: string }
  blendWeight: number | null
  availability: 'available' | 'unavailable'
  reasonCodes: BenchmarkProvenanceReasonCode[]
}

export interface BenchmarkProvenanceSet {
  mode: 'single' | 'blended'
  entries: BenchmarkProvenanceEntry[]
}
```

When `benchmarkRowFromCauseSegment` creates the selected row, write segment cause/taxonomy/calendar metadata explicitly instead of relying on inherited base metadata. Build entries from `benchmarkBlend.candidates` when a blend is used, otherwise from the exact candidate used by the suggestion path. A blended entry's `blendWeight` is its normalized contribution to the benchmark portion, not the raw heuristic weight. Sort entries by applied contribution descending, then scope priority `project`, `company`, `industry`, `global`, then stable benchmark/publication identity.

An entry is available only when all required fields are present: exact scope, non-empty version, valid generated/as-of/window timestamps, positive sample count, production-day basis, and either an exact calendar ref/version or a non-empty fully valid aggregate calendar identity list. Runtime entries also require `publicationKey`; cause entries also require cause code and taxonomy version. Build set availability as follows:

```ts
const validCount = entries.filter((entry) => entry.availability === 'available').length
const availability = entries.length === 0 || validCount === 0
  ? 'unavailable'
  : validCount === entries.length
    ? 'available'
    : 'partial'
```

Use the union of entry reason codes as `benchmarkProvenanceReasonCodes`; the first sorted code is `benchmarkProvenanceUnavailableReason`. Scalar summary fields are derived only from a fully available set. For a single entry, copy its values. For a blend, use oldest `sourceAsOf`, earliest `sourceWindowStart`, latest `generatedAt`, summed sample count, production-day basis, `benchmarkScope='mixed'` when scopes differ, and `benchmarkVersion=null`; the complete per-entry versions remain authoritative. Never use request time, response time, task update time, or one primary candidate as a fallback for the set.

- [ ] **Step 5: Normalize and render client provenance**

Add only camelCase public fields and the structured `benchmarkProvenance` object to the client DTO; do not revive generic `generatedAt`. Validate the enum values and arrays instead of passing unknown JSON through. Render the summary time/window, then one compact row per source with exact scope, version, sample count, day basis, cause identity when present, and blend percentage when blended. Partial/unavailable states list a stable localized message from reason codes and never hide a used source. Update the static contract to forbid `suggestion.generatedAt`, `referenceFrozenAt`, and `isReferenceFrozen` while requiring `benchmarkGeneratedAt`, `benchmarkProvenance`, and exact scope values.

- [ ] **Step 6: Run tests, both typechecks, and commit**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationLearningRuntimeLifecycleService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/durationLearningRuntimePublicationService.test.ts src/__tests__/durationBenchmarkProductionChain.test.ts src/__tests__/durationSuggestionService.test.ts src/__tests__/durationBenchmarkCauseSegmentService.test.ts src/__tests__/canonicalCauseBenchmarkMigration.test.ts
npm exec --workspace=client -- vitest run --config vitest.config.ts --configLoader runner src/services/__tests__/durationSuggestionsApi.test.ts src/components/planning/__tests__/DurationSuggestionTooltip.test.tsx src/__tests__/contracts/durationSurface.contract.test.ts
npm exec --workspace=server -- tsc -p tsconfig.json --noEmit
npm exec --workspace=client -- tsc -p tsconfig.json --noEmit
git add server/src/services/durationLearningRuntimeLifecycleService.ts server/src/services/durationLearningAssetAtomicStoreService.ts server/src/services/durationSuggestionService.ts server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationLearningRuntimePublicationService.test.ts server/src/__tests__/durationBenchmarkProductionChain.test.ts server/src/__tests__/durationSuggestionService.test.ts client/src/services/durationSuggestionsApi.ts client/src/services/__tests__/durationSuggestionsApi.test.ts client/src/components/planning/DurationSuggestionTooltip.tsx client/src/components/planning/__tests__/DurationSuggestionTooltip.test.tsx client/src/__tests__/contracts/durationSurface.contract.test.ts
git commit -m "feat(duration-assets): expose complete benchmark provenance"
```

---

### Task 7: Registry, Browser Verification, And Workstream Gate

**Files:**
- Modify: `server/src/registry/system-domain-registry.json`
- Modify: `server/src/__tests__/systemRegistryGuard.test.ts`
- Create: `project-testing/tools/verify-duration-assets-admin-ui.mjs`
- Create: `project-testing/tools/verify-duration-assets-admin-ui.test.mjs`
- Modify: `project-testing/matrix/release-test-matrix.json`

**Interfaces:**
- Registers migration 325, queue service, decision service, route, page, and browser verifier.
- Produces deterministic desktop/mobile UI verification without staging or production access.

- [ ] **Step 1: Write registry and browser-verifier REDs**

Registry tests require all new source paths and migration 325. The Node test reads the browser script and requires:

```js
assert.match(source, /1440\s*,\s*900/)
assert.match(source, /390\s*,\s*844/)
assert.match(source, /\/admin\/duration-assets/)
assert.match(source, /page\.route\(/)
assert.match(source, /duration-assets-overlap/)
assert.doesNotMatch(source, /staging|production/i)
```

- [ ] **Step 2: Run the REDs**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/systemRegistryGuard.test.ts
node --test project-testing/tools/verify-duration-assets-admin-ui.test.mjs
```

Expected: FAIL on missing registrations and browser script.

- [ ] **Step 3: Register the new system surfaces**

Add the migration, services, route, page, API, and verification script using the registry's existing ownership and evidence fields. Do not mark staging, production, or live status as ready.

- [ ] **Step 4: Implement deterministic Playwright checks**

The script starts or accepts a local Vite URL, intercepts auth/workspace/queue/accuracy/readiness endpoints, and runs the same assertions at `1440x900` and `390x844`. It must verify:

- nonblank first viewport;
- queue, published, monitoring, and accuracy tabs;
- shared read-only item has no mutation buttons;
- approve dialog opens for a company item;
- long reason text and filter controls do not overlap;
- `document.body.scrollWidth <= viewport width + 1` on mobile;
- screenshots write only to `project-testing/artifacts/browser-checks/duration-assets/`.

The overlap check writes `duration-assets-overlap.json` only as ignored evidence and exits nonzero on any intersecting visible control rectangles.

- [ ] **Step 5: Run focused and architecture gates**

```powershell
npm exec --workspace=server -- vitest run --config vitest.config.ts --configLoader runner src/__tests__/durationAssetReviewMigration.test.ts src/__tests__/migrationEntryPoints.test.ts src/__tests__/durationAssetReviewQueueService.test.ts src/__tests__/durationLearningRuntimeReviewQueue.test.ts src/__tests__/durationLearningRuntimeLifecycleService.test.ts src/__tests__/durationAssetReviewDecisionService.test.ts src/__tests__/durationAssetReviewStableApproval.test.ts src/__tests__/durationAssetsRoute.test.ts src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts src/__tests__/algorithmSeedRoutes.test.ts src/__tests__/durationLearningRuntimePublicationService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/durationBenchmarkProductionChain.test.ts src/__tests__/durationBenchmarkCauseSegmentService.test.ts src/__tests__/durationSuggestionService.test.ts src/__tests__/systemRegistryGuard.test.ts
npm exec --workspace=client -- vitest run --config vitest.config.ts --configLoader runner src/services/__tests__/durationAssetsApi.test.ts src/services/__tests__/ruleAssetGovernanceWorkbenchApi.test.ts src/pages/__tests__/DurationAssetsAdmin.test.tsx src/pages/__tests__/DurationAccuracyAdmin.test.tsx src/pages/__tests__/RuleAssetGovernanceWorkbenchAdmin.test.tsx src/services/__tests__/durationSuggestionsApi.test.ts src/components/planning/__tests__/DurationSuggestionTooltip.test.tsx src/__tests__/contracts/durationSurface.contract.test.ts
node --test project-testing/tools/verify-duration-assets-admin-ui.test.mjs
node project-testing/tools/verify-duration-assets-admin-ui.mjs
npm run guard:tracked-relative-imports --workspace=server
npm run guard:system-registry --workspace=server
npm run guard:duration-architecture --workspace=server
npm exec --workspace=server -- tsc -p tsconfig.json --noEmit
npm exec --workspace=client -- tsc -p tsconfig.json --noEmit
node server/scripts/run-workflow-contract-gate.mjs
```

Expected: all commands exit 0. Browser artifacts remain ignored and are not staged.

- [ ] **Step 6: Freeze and request whole-workstream review**

```powershell
git add server/src/registry/system-domain-registry.json server/src/__tests__/systemRegistryGuard.test.ts project-testing/tools/verify-duration-assets-admin-ui.mjs project-testing/tools/verify-duration-assets-admin-ui.test.mjs project-testing/matrix/release-test-matrix.json
git commit -m "test(duration-assets): register and verify workstream"
git diff --check c66c79188cb773b6d3ff878bf1f9afe178ace8cf..HEAD
git status --short
```

Require a clean immutable SHA and an independent whole-workstream review with no open P0/P1/P2 before starting Workstream 3. Report migration apply, staging, production, deployment, and live as not performed.

## Self-Review Checklist

- [ ] Every Workstream 2 acceptance statement maps to at least one task and executable test.
- [ ] No task introduces a second publication or approval engine.
- [ ] All six asset keys come from the runtime publication type and are locked by tests and SQL.
- [ ] Candidate and stable-promotion review identities include canonical decision fingerprints; exact replay reuses terminal decisions and changed evidence creates a new item.
- [ ] Stable-promotion review persistence covers all six families and commits queue upsert with impact recording.
- [ ] Project benchmark stable promotion uses `promoteDurationBenchmarkRuntimeCanaryAtomically` inside the outer queue/impact transaction.
- [ ] Manual stable approval locks and re-evaluates current monitoring evidence, matches the stored fingerprint, records passed impact, promotes, activates benchmark/cause state when applicable, and resolves the queue in one transaction.
- [ ] Shared-scope visibility is sanitized and company-admin mutation is impossible.
- [ ] Migration constraints forbid contradictory open/terminal resolution metadata, and RLS tests prove exact member and backend predicates.
- [ ] No operator authority or request-body project-visibility authority is introduced.
- [ ] Automatic resolution has no fabricated reviewer; manual approval persists the real reviewer, reason, timestamp, and resolution source.
- [ ] Queue payloads contain no runtime payload or raw evidence authority.
- [ ] Persisted rows, runtime publications, cause segments, exact scopes, mixed blends, versions, and missing windows have executable provenance coverage.
- [ ] Missing or partial benchmark provenance stays fail-closed end to end and never invents a timestamp.
- [ ] Existing admin routes remain compatible.
- [ ] All Vitest commands use repository-pinned `npm exec --workspace=... -- vitest`.
- [ ] The plan contains no staging/production write step and no `EXECUTION_PROGRESS.json` change.
