# WorkBuddy Project Search

This folder is the single home for WorkBuddy search, public data collection, downloaded evidence, MCP/plugin configuration, and local governance outputs.

## Folder Map

- `skills/workbuddy-project-search/`: project-local skill. Use it before any WorkBuddy search, crawl, download, or external evidence processing.
- `plugins/mcp-servers/`: locally downloaded MCP packages for Tavily, Firecrawl, and Exa.
- `plugins/mcp-config/`: MCP configuration templates. Do not write API keys into committed files.
- `tools/`: local scripts that turn search evidence into governed source, document, candidate, extraction, and calibration packages.
- `external-duration-research/`: engineering experience and duration-knowledge evidence.
- `public-project-data/`: actual public project data, public shadow calibration reports, and real-project search evidence.
- `knowledge-base/`: governed local asset catalog built from reviewed source/candidate packages. This is a review/search index only, not runtime publication.
- `inbox/`: new unreviewed downloads before source verification.
- `logs/`: search run logs and collection notes.

## Required Search Combination

1. Skill controls rules: load `project-search/skills/workbuddy-project-search/SKILL.md` for any project-search task.
2. MCP/plugins collect: use Tavily for broad search, Exa for semantic expansion, and Firecrawl for crawl/scrape/extract when API keys are available.
3. Local scripts govern outputs: use `project-search/tools/*` to generate repository-local source/document/candidate/calibration packages.
4. No product-database ingestion: search artifacts cannot write product tables or become an API, worker, scheduler, container, CI release, or runtime dependency.

## Installed MCP Packages

Install or refresh them with:

```powershell
npm install --prefix project-search/plugins/mcp-servers --save-exact tavily-mcp@0.2.20 firecrawl-mcp@3.22.1 exa-mcp-server@3.2.1
```

Or use the guarded project script, which downloads missing packages and reports whether local API key environment variables are present:

```powershell
node project-search/tools/ensure-search-mcp-plugins.mjs
```

Use the templates in `plugins/mcp-config/` to wire them into Codex or another MCP host after setting API keys outside the repo.

## Knowledge Catalog

Build the governed local catalog:

```powershell
node project-search/tools/build-progress-knowledge-asset-catalog.mjs
```

Query it without mutating the database:

```powershell
node project-search/tools/query-progress-knowledge-asset-catalog.mjs --family duration_quota_extracted_tables --q 带形基础 --limit 5
```

Build the review workbench and blank decision templates:

```powershell
node project-search/tools/build-progress-knowledge-review-workbench.mjs
```

Validate filled or blank review decisions:

```powershell
node project-search/tools/validate-progress-knowledge-review-decisions.mjs --decisions-file project-search/knowledge-base/review-workbench/progress-knowledge-review-decision-template.csv
```

Generate a clearly marked example decision CSV that is not applicable as a real review input:

```powershell
node project-search/tools/build-progress-knowledge-sample-review-decisions.mjs
```

Turn a filled decision CSV into a governed outcome report only:

```powershell
node project-search/tools/build-progress-knowledge-review-outcome-report.mjs --decisions-file project-search/knowledge-base/review-workbench/progress-knowledge-review-decision-template.csv
```

Build reviewer-assist machine precheck suggestions without writing decisions:

```powershell
node project-search/tools/build-progress-knowledge-machine-precheck.mjs
```

Build the compact evidence dossier for the machine-prioritized review items:

```powershell
node project-search/tools/build-progress-knowledge-priority-evidence-dossier.mjs
```

Build the searchable topic/card index for all governed knowledge assets:

```powershell
node project-search/tools/build-progress-knowledge-topic-index.mjs
```

Build the compact retrieval pack from the topic/card index:

```powershell
node project-search/tools/build-progress-knowledge-retrieval-pack.mjs
```

Query the compact retrieval pack:

```powershell
node project-search/tools/query-progress-knowledge-retrieval-pack.mjs --q 朝阳公馆 --card-type real_project_case_card --json
node project-search/tools/query-progress-knowledge-retrieval-pack.mjs --first-pass --limit 10
node project-search/tools/query-progress-knowledge-retrieval-pack.mjs --family duration_quota_extracted_tables --region CN-GD --phase below_zero_basement --limit 5
```

Query the topic/card index:

```powershell
node project-search/tools/query-progress-knowledge-topic-index.mjs --region CN-GD --phase below_zero_basement --limit 5
node project-search/tools/query-progress-knowledge-topic-index.mjs --topic duration_quota:CN-BJ:civil_building_no_basement:below_zero_no_basement --json
node project-search/tools/query-progress-knowledge-topic-index.mjs --q 朝阳公馆 --json
node project-search/tools/query-progress-knowledge-topic-index.mjs --family clause_sequence --q 施工顺序 --limit 5
node project-search/tools/query-progress-knowledge-topic-index.mjs --conflict-status regional_variant_conflict --region CN-BJ --limit 5
```

Build review-only domain packs from the topic/card index:

```powershell
node project-search/tools/build-progress-knowledge-domain-packs.mjs
```

The generated packs live under `project-search/knowledge-base/domain-packs/`:

- `progress-knowledge-real-project-cases.*`
- `progress-knowledge-construction-organization-clauses.*`
- `progress-knowledge-duration-quota-rows.*`

Build the canonical knowledge-base manifest:

```powershell
node project-search/tools/build-progress-knowledge-base-manifest.mjs
```

Run the knowledge-base health audit:

```powershell
node project-search/tools/check-progress-knowledge-base-health.mjs
```

The health audit verifies count consistency, local artifact presence, domain-pack alignment, review-only status, and the no-runtime/no-business-write boundary.

## Default Evidence Flow

External engineering experience:

`source discovery -> source verification/download/hash -> extraction review -> candidate review -> calibration/conflict review -> code-owner review -> official seed/rule/template change -> tests -> normal code release`

Actual public project data:

`source discovery -> source verification/download/hash -> local comparison -> report -> code-owner review -> official source/test change`

Search-center output is always repository-local research material. Runtime learning remains a separate product subsystem driven only by real project facts and outcomes.
