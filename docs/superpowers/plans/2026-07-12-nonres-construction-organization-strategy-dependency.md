# Non-Residential Construction Organization Strategy And Dependency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make industrial, transportation-hub, and sports/culture wizard plans select subtype-appropriate construction-organization strategies and consume sufficient domain process, duration, rhythm, and dependency assets.

**Architecture:** Keep one construction-organization contract, but model multiple governed policy variants per business type. Resolve a variant from existing wizard facts, materialize its interface stages into the candidate virtual network, and select only the matching subtype asset overlay. Keep common GB assets shared and add explicit L2 same-pack and L3 cross-pack dependencies for the three domain catalogs.

**Tech Stack:** TypeScript, Vitest, existing WBS/domain seed registries, construction-organization selector, wizard template recommendation/selection.

## Global Constraints

- Use only existing wizard facts; do not add mandatory drawing, subcontract, equipment-resource, procurement, or manual-input fields.
- Learning outputs remain candidate/replay governed and do not mutate cold-start seeds directly.
- Preserve common assets; add subtype overlays instead of duplicating generic GB WBS content.
- Local verification is not production/live evidence.
- Do not modify or delete historical audit reports.
- The shared worktree is dirty; do not stage or commit unrelated files.

---

### Task 1: Strategy Variant Contract And Runtime Selection

**Files:**
- Modify: `server/src/seeds/projectConstructionOrganizationPolicySeed.ts`
- Modify: `server/src/services/constructionOrganizationScenarioSelectorEngine.ts`
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Test: `server/src/__tests__/constructionOrganizationBusinessTypeStrategyVariants.test.ts`

- [x] Write tests proving industrial, hub, and venue subtypes select distinct policy ids and distinct policy-network signatures.
- [x] Run the focused test and confirm it fails because only one policy and the generic six-scenario network exist.
- [x] Add policy applicability signals and four variants per target business type while retaining a default fallback.
- [x] Merge selected policy interface stages and dependencies into every candidate plan-option network.
- [x] Pass full wizard facts into policy resolution from selector and WBS generation consumers.
- [x] Run focused selector tests and server typecheck.

### Task 2: Domain Asset Coverage And Conditional Wizard Consumption

**Files:**
- Modify: `server/src/seeds/domainWbsTemplateCatalogs.ts`
- Modify: `server/src/seeds/t2DivisionRhythmTemplateSeed.ts`
- Modify: `server/src/seeds/standardWorkDurationSeed.ts`
- Modify: `server/src/services/projectFactsToTemplateService.ts`
- Modify: `server/src/services/wizardTemplateSelectionService.ts`
- Test: `server/src/__tests__/constructionSpecialtyAssetCoverage.test.ts`

- [x] Write tests requiring at least 16 dedicated item packs and 80 processes per target catalog.
- [x] Write tests requiring industrial heavy/process, hub metro/bus, and venue theater/exhibition rhythm assets.
- [x] Write tests proving subtype overlays are selected only for matching project facts.
- [x] Run focused tests and confirm the expected coverage/selection failures.
- [x] Add eight differentiated packs per target catalog and two subtype rhythm templates per target business type.
- [x] Extend duration profile subtype/method factors and propagate selected policy variant into wizard template selection.
- [x] Run focused catalog, selection, duration, and typecheck verification.

### Task 3: Executable L2 And L3 Dependency Assets

**Files:**
- Modify: `server/src/seeds/standardInternalFlowSeed.ts`
- Modify: `server/src/seeds/v1475CrossItemWorkflowSeed.ts`
- Test: `server/src/__tests__/constructionSpecialtyAssetCoverage.test.ts`
- Test: `server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts`

- [x] Write tests proving every adjacent dedicated process pair resolves to a curated L2 dependency.
- [x] Write tests requiring explicit industrial production, hub operation, and venue event L3 handoffs.
- [x] Run focused tests and confirm current zero-prefix coverage fails.
- [x] Generate stable-code L2 rules from the three governed catalogs and add explicit L3 handoff rules with lag/calibration policy.
- [x] Verify generated wizard rows consume the new dependency assets and remain acyclic.
- [x] Run dependency trust and managed-frontier regression tests.

### Task 4: Completion Audit And Project Mapping

**Files:**
- Modify: `EXECUTION_PROGRESS.json`
- Preserve: `project-testing/reports/**` historical reports

- [x] Run focused RED/GREEN tests, server typecheck, workspace-isolation guard, and the v1.4.23.1 non-live closeout suite.
- [x] Inspect generated outputs for all three target business types and compare subtype policy/network signatures.
- [x] Update `EXECUTION_PROGRESS.json` with the actual tests and remaining staging/production boundary.
- [x] Keep production/live status unclosed unless fresh deployed environment evidence exists.

## Verification Record

Independent review reopened this task after the first green pass. The remediation now proves the full local chain with real wizard-produced fields: variant selection, generated specialty process rows, duration and T2 lineage, L3 ingress/internal/egress coverage, acyclic dependency graphs, and bounded cross-lane expansion.

- Typecheck: server and client passed (`npm exec --workspace=<workspace> -- tsc -p tsconfig.json --noEmit`).
- Focused backend regression: 4 files / 46 tests passed. This covers 12 policy variants, specialty asset inventory, wizard subtype selection, and the 11-type/18-subtype recommendation contract.
- Focused client regression: 1 file / 3 tests passed. Industrial, transportation-hub, and sports/culture each expose four subtype choices and return the selected subtype code.
- Nine-subtype real assembly: the targeted long-running test passed in 156.729 seconds. Every subtype selected its own policy variant, subtype pack, organization-variant T2 asset, duration-formula lineage, and three-part L3 workflow lineage; unrelated subtype packs stayed excluded.
- All-11-business-type assembly: 3 targeted tests passed in 267.693 seconds. Executable default-master-plan consumption, construction-organization network evidence, and organization-compatible bounded dependency fallback remained ready.
- Dependency inventory: 192 curated L2 adjacent-process edges and 45 specialty L3 mainline rules are available. The 27 new subtype rules provide one ingress, one internal handoff, and one egress per non-default subtype; specialty process rules use no unbounded `same_project` scope.
- Guards: workspace isolation passed with 489 files scanned; duration architecture passed with 971 files and legacy debt 0; construction-organization hydration passed with 646 files; business-type registry passed 4 tests.
- Broad v1.4.23.1 non-live closeout: executed but not fully green. Its only current failure is the unrelated historical C-16 ledger count phrase (`84/405/28/77/311`) lagging the current required registry count (`84/406/28/77/315`). `migrationEntryPoints.test.ts` passed 3/3. Historical audit and ledger files were not edited to conceal the failure.
- Environment boundary: local code and behavior are verified. No staging deployment, production deployment, live DB write, runtime publication, monitoring, or rollback was executed in this task.

### 2026-07-12 Temporal Plausibility Correction

- A fresh four-type executable simulation exposed a false-green result: industrial fire/explosion/environment commissioning and transportation-hub command/emergency full-network commissioning were scheduled on project day one, and startup incorrectly depended on the late specialty root.
- Root cause 1: newly added `IPL-05 / TRH-04 / SPC-05` specialty packs fell through to `management_support` because their phase mappings were absent. The same gate then exposed pre-existing `DTC` data-center packs with the same defect.
- Root cause 2: executable-network stabilization selected the shortest same-day root instead of prioritizing the startup primary-control row, and secondary component releases discarded their original start offset.
- The generator now maps all affected specialty packs to field phases, prioritizes the startup primary-control root, preserves every root component's original `SS+lag`, and blocks wizard readiness on synthetic dependency phase inversion or late-activity `management_support` misclassification.
- Fresh outputs: industrial commissioning moved from `2026-08-01` to `2027-09-06`; transportation-hub full-network commissioning moved from `2026-08-01` to `2027-10-07`; data-center UPS, generator, and ATS commissioning moved to September 2027. All plans have one startup root and zero temporal-plausibility violations.
- Fresh verification: server TypeScript passed; executable assembly 11/11 tests passed; construction-quality audit 9/9 passed; 9 subtype assembly passed; all-11 executable contract passed; all-11 construction-organization wiring and bounded cross-item fallback passed; four-type and data-center simulations passed. Guards passed at workspace isolation 492 files, duration architecture 974 files with debt 0, construction-organization hydration 649 files, and business-type registry 4 tests.

### 2026-07-12 Field-Usability Correction

- Zero-basement wizard facts now replace deep-pit and basement controls with `场地平整、土方与基础开挖` and `基础承台地梁施工与基础验收`. These rows consume `earthwork_excavation_transport` and `shallow_foundation_concrete_structure` rather than deep-foundation support assets.
- Promoted commissioning and trial-operation rows are aligned to their business-type phase before physical handoff selection. Renovation functional retesting now traces to fitout restoration; modular trial operation traces to MEP connection and downstream physical completion instead of project-start release.
- Non-residential business profiles now emit contractual closeout milestones directly. `竣工验收备案完成` follows the business-type commissioning/acceptance terminal, and `物业业主移交保修启动` follows filing. Method-only specialty acceptance rows remain in drilldown instead of becoming the project terminal.
- Testing-center blockers were added for wizard fact/task contradictions, late activities without physical handoff, and contractual closeout without business handoff. The audit has 12 passing tests and reads the fresh current report without modifying historical reports.
- Fresh all-11 report: `project-testing/reports/executable-default-master-plan-current-20260712-r8`. All 11 plans pass with one root, one sink, continuous CPM, no dependency or schedule-propagation cycle, and zero counts for project-fact/duration-asset contradictions, direct or transitive physical-handoff gaps, and strict contractual-closeout chain gaps. Row counts are 102, 70, 116, 90, 88, 84, 84, 80, 107, 60, and 87 by registry order.
- Verification: server TypeScript passed; executable assembly 12/12 passed; the enhanced all-11 executable contract passed with explicit terminal-code assertions; testing-center construction quality passed 16/16; duration architecture, construction-organization hydration, and business-type registry guards passed.
- Current shared-worktree exception: `guard:workspace-isolation` is red on unrelated/concurrent service findings. None of this correction's generator, assembly, projection, or testing-center files were listed, but repository-wide local closeout must remain unclaimed until that shared gate is green.
- Environment boundary remains unchanged: this is local static and local code verification only. No staging deployment, production/live deployment, DB mutation, runtime publication, live monitoring, or rollback execution occurred.

### 2026-07-12 Independent Review Remediation

- Shallow and deep zero-basement projects are now distinct. Explicit shallow projects use earthwork and shallow-foundation concrete assets; explicit deep-foundation projects keep support/dewatering controls but replace the impossible basement-structure row with a deep-foundation cap/grade-beam handoff.
- `BTMP-MOD-03` consumes `shallow_foundation_concrete_structure` when the modular wizard facts explicitly say zero basement and foundation depth below 3 m. The testing center also blocks a shallow project whose row silently retains a deep-pit duration seed.
- Physical-handoff validation now traverses predecessor chains. A commissioning row no longer passes merely because it points to another commissioning row that ultimately traces only to a synthetic project-start release; assembly actively adds a physical work control and the audit blocks any remaining synthetic-only ancestry.
- Contractual closeout no longer discovers the terminal by title. Each non-residential filing/property row carries `contractual_closeout_role` and `contractual_terminal_control_code`; assembly and tests enforce the exact declared `terminal -> filing -> property handover` chain for all 10 non-residential business types.
- Independent review findings were reproduced with RED tests before implementation and are now covered by the enhanced all-11 contract, 12 assembly tests, and 16 testing-center construction-quality tests. The final review follow-up also proved that removing both contractual closeout rows is blocking rather than silently passing.
- Residual non-blocking presentation risk: a few convergence controls still have dense predecessor lists. The CPM network is valid; a later simple-table rendering change should collapse repeated labels without deleting dependency truth.
