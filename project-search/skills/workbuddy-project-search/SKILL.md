---
name: workbuddy-project-search
description: Repository-local research workflow for WorkBuddy code calibration. Use when collecting, downloading, crawling, extracting, or organizing public project data, construction engineering experience, duration quota documents, enterprise manuals, public procurement/permit records, or any project-search artifact.
---

# WorkBuddy Project Search

Use this skill to keep WorkBuddy research evidence useful without letting unverified web material become runtime product facts. All search-related files stay under `project-search/`.

## Workflow

1. Start at `project-search/README.md` and keep new artifacts inside the folder named there.
2. Classify the request:
   - Actual project data: public procurement, permit, supervision, completion, tender, bid, project profile, or progress evidence. Store under `project-search/public-project-data/`.
   - Engineering experience: duration quota, construction method, enterprise manual, WBS template, process interleaving, climate/resource assumptions. Store under `project-search/external-duration-research/`.
   - Collection tooling: MCP/plugin config, API key template, crawler logs. Store under `project-search/plugins/` or `project-search/logs/`.
3. Use MCP/plugins for collection when available:
   - Tavily: broad search and source discovery.
   - Exa: semantic search and related-source expansion.
   - Firecrawl: scrape/crawl/extract pages and PDFs.
   - Native web/browser tools are allowed for spot verification, but final evidence still needs local artifacts and source notes.
4. If the collection MCP packages are missing, run `node project-search/tools/ensure-search-mcp-plugins.mjs` before collecting. This may download packages under `project-search/plugins/mcp-servers/`, but must not write API keys into the repo.
5. Use local scripts for governed outputs from `project-search/tools/`.
6. Stop at the repository boundary. Search results remain local review inputs; accepted findings are encoded into official seed/rule/template source and tests through normal code review.

## Boundaries

Treat web results as evidence leads until they pass source verification, download/hash, extraction review, candidate review, calibration, and code-owner review.

Never use search output to directly write:

- `tasks`
- `task_baselines`
- `monthly_plans`
- `monthly_plan_items`
- `task_dependencies`
- `duration_experience_samples`
- `actual_duration_outcomes`
- `critical_path`
- published runtime overlays or production seed rows
- product database source/document/candidate/calibration/readiness tables

Public project data and engineering experience may create only files under `project-search/`. The approved path is `reviewed local evidence -> source-code asset change -> automated tests -> normal code release`. Project-search tools must not mutate the product database; separately authorized read-only comparison is diagnostic only. The API, workers, schedulers, containers, CI release gates, and runtime metadata must not depend on project-search paths.

## Output Contract

Every search run should leave a short record with:

- query set and collection tool used
- source URL and access date
- local artifact path
- source type and trust level
- hash when a file is downloaded
- extraction status
- next governance step
- explicit mutation boundary
