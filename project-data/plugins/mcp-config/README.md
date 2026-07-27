# WorkBuddy Data MCP Config Templates

These templates wire data-governance MCP tools into Codex or another MCP host. They are examples only.

Do not commit:

- Supabase access tokens
- database URLs
- database passwords
- service-role keys
- production project refs

## Supabase MCP

Use `workbuddy-supabase-readonly` for project-scoped, read-only Supabase metadata and SQL exploration.

Required environment variables:

- `SUPABASE_ACCESS_TOKEN`
- `WORKBUDDY_SUPABASE_PROJECT_REF`

The template uses `--read-only` and `--project-ref`.

## MCP Toolbox

Use `workbuddy-toolbox-postgres-readonly` only with a reviewed `tools.yaml` and environment variables supplied outside the repo.

Required environment variables depend on the selected source config. The default template expects:

- `WORKBUDDY_PG_HOST`
- `WORKBUDDY_PG_PORT`
- `WORKBUDDY_PG_DATABASE`
- `WORKBUDDY_PG_USER`
- `WORKBUDDY_PG_PASSWORD`

Keep production targets disabled unless a separate governed handoff exists.
