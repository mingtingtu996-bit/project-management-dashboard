# Browser Check Artifacts

Browser suites write generated screenshots, videos, traces, console logs, accessibility output, and smoke-test captures below this directory. The generated files are intentionally ignored.

## Rules

- Never record passwords, session cookies, access tokens, authorization headers, database credentials, or unredacted sensitive data.
- Separate `local`, `staging`, and `production` runs. Each non-local run must identify the tested deployment SHA and public target without embedding secrets.
- A browser artifact proves only the observed flow and target recorded by that run. It cannot substitute for API health, migration, rollback, monitoring, or same-SHA deployment evidence.
- Review captures before sharing or promoting them into a governed evidence package.
