# WorkBuddy Project Center Boundaries

Last checked: 2026-07-02

This document defines the ownership and dependency boundaries for the project-local engineering centers:

- `project-search/`
- `project-ui/`
- `project-testing/`
- `project-evidence/`

Product features named "center" or "dashboard", such as notification center, are outside this document unless they produce engineering evidence consumed by these folders.

## Boundary Model

These folders are ownership boundaries, not zero-dependency boundaries. Centers may read from each other through documented inputs, but they must not take over another center's authority or mutate production/runtime data outside their own governed path.

Allowed dependency direction:

```text
project-search  -> project-testing
project-search  -> project-evidence
project-ui      -> project-testing
project-ui      -> project-evidence
project-testing -> project-evidence
```

`project-evidence/` is an index and classification layer. It reads tool-owned folders, classifies authority, and records cleanup decisions. It must not become the storage owner for large generated artifacts or the decision owner for release, UI, or search workflows.

## Center Responsibilities

| Center | Owns | Does not own |
| --- | --- | --- |
| `project-search/` | External search, public source collection, download/hash metadata, source verification, candidate extraction, calibration packages, search MCP/plugin configuration templates | Production writes to tasks, baselines, monthly plans, dependencies, runtime overlays, risks, issues, warnings, reminders, or seeds |
| `project-ui/` | UI implementation governance, Figma/design data, component/page implementation indexes, UI tooling inventory, visual baseline policy, UI artifacts and UI reports | Release-grade browser certification, live/DB checks, production readiness decisions, backend business metric truth |
| `project-testing/` | Test inventory, release gate matrix, local test profiles, readiness dashboards, live/DB handoff plans, controlled staging/live evidence gates, closeout evaluation | Raw external source discovery, UI design ownership, evidence cleanup authority outside documented handoff/index rules |
| `project-evidence/` | Repository-level evidence index, authority classification, prune/archive plans, cleanup review decisions | Moving/deleting tool-owned artifacts without updating consumers, replacing center-owned reports, creating production-ready claims by itself |

## Allowed Cross-Center Reads

- `project-testing/` may consume `project-search/` outputs as candidate, source-kit, calibration, or production-readiness input evidence.
- `project-testing/` may consume `project-ui/` outputs for UI/browser/a11y/performance/release verification.
- `project-evidence/` may index `project-search/`, `project-ui/`, `project-testing/`, selected `docs/`, and diagnostic output according to its build script.
- `project-ui/` may delegate release-grade UI verification to `project-testing/`.

## Forbidden Cross-Center Actions

- `project-search/` must not directly write production business data or published runtime assets.
- `project-ui/` must not bypass `project-testing/` to declare release readiness or production readiness.
- `project-testing/` must not redefine UI visual baseline policy owned by `project-ui/`; it may verify against it.
- `project-evidence/` must not delete, move, or rewrite center-owned artifacts that are still consumed by scripts, matrices, reports, or moved-file ledgers.
- No center may store API keys, production secrets, or long-lived credentials in committed files.
- No generated evidence may be treated as authoritative unless a current consumer script, matrix, gate, handoff, or closeout evaluator reads it.

## Health Check Contract

The unified center health check is:

```powershell
npm run center:check
```

As of 2026-07-02, this expands to:

```text
npm run search:center:check
npm run testing:center:check
npm run ui:center:check
npm run ui:visual-baseline:check
npm run evidence:center:build
```

The first four checks are read-only center validation. `evidence:center:build` regenerates files under `project-evidence/index/`; this is an evidence index update, not a production/runtime data write.

## Current Verified Status

`npm run center:check` passed on 2026-07-02 in `C:\Users\jjj64\WorkBuddy\20260318232610`.

Reported status:

- Search center: passed; Tavily, Firecrawl, and Exa MCP packages were installed/configured at required versions and API key environment variables were present.
- Testing center: passed; 20 gate groups, 15 moved entries, 8 tool inventory entries, and no active live thread.
- UI center: passed; 9 profiles, 21 commands, 24 sources, and 49 moved entries.
- Visual baseline: passed; 2 surfaces and 3 commands.
- Evidence center build: passed; indexed 2328 files, 498.4 MB, with 0 delete candidates, 0 rotate candidates, and 20 archive candidates.

Archive candidates are not automatic deletions. They require review against current consumers before movement or removal.

## When To Add Another Center

Do not add a center only because a topic is important. Add one only when all of these are true:

1. The topic has a stable owner and recurring workflow.
2. The topic produces or consumes enough artifacts that current folders are becoming ambiguous.
3. The topic needs a separate health check or readiness gate.
4. The topic has clear write boundaries that prevent overlap with existing centers.

Likely future candidates:

- `project-ops/`: deployment, environment profiles, staging/live authorization, rollback, monitoring, and production operation handoff.
- `project-data/`: database schema, migrations, RLS, seed data, data quality, and governed data fixtures.

Do not create these until existing `project-testing/`, `deploy/`, `supabase/`, `server/src/scripts/`, and docs ownership becomes too ambiguous to maintain.
