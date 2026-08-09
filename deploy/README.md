# Production ingress boundary

The Compose stack exposes the web container only on `127.0.0.1:${WEB_PORT}`
(default `8080`). A host-level CDN, load balancer, Caddy, or Nginx instance must:

- terminate a valid public TLS certificate;
- redirect public HTTP to HTTPS;
- proxy HTTPS and WSS traffic to the loopback web port;
- send `X-Forwarded-Proto: https`;
- prevent public access to the loopback web port and API container network.

The API rejects non-probe production requests that do not arrive through this
trusted HTTPS boundary. `/api/livez` and `/api/readyz` remain
available to local container and deployment probes.

## Domain ingress and authentication boundary

`deploy/docker-compose.ingress.yml` and `deploy/ingress/Caddyfile` own shared
ports 80/443. SNI routes `zhuxucloud.com` to production port 8080 and
`staging.zhuxucloud.com` to staging port 8081. The protected
`provision-domain-ingress.yml` workflow validates a candidate, activates it
atomically, probes both domains from a public runner, and restores the previous
configuration on failure.

The two hostnames create separate browser origins and cookie hosts. Distinct
cookie names remain defense in depth and make each API select only its own
token.

Production runtime values are:

- `COMPOSE_PROJECT_NAME=project-management`
- `WEB_PORT=8080`
- `AUTH_COOKIE_NAME=workbuddy_production_auth_token`
- `JWT_ISSUER=workbuddy-production`
- `JWT_AUDIENCE=workbuddy-production-api`

Staging runtime values are:

- `COMPOSE_PROJECT_NAME=project-management-staging`
- `WEB_PORT=8081`
- `AUTH_COOKIE_NAME=workbuddy_staging_auth_token`
- `JWT_ISSUER=workbuddy-staging`
- `JWT_AUDIENCE=workbuddy-staging-api`

Each environment requires its own random `JWT_SECRET`. `PUBLIC_HTTPS_ORIGIN`
and the sole `CORS_ORIGIN` must equal that environment's exact HTTPS origin.
Production uses `https://zhuxucloud.com`; staging uses
`https://staging.zhuxucloud.com`. `PUBLIC_INGRESS_MODE=domain_hsts` is required
for the domain release. The API validates these values again at startup,
including direct recovery starts that do not run the deployment script.

The protected GitHub environments also register the runtime secret hashes as
`STAGING_JWT_SECRET_SHA256` / `STAGING_PEER_JWT_SECRET_SHA256` and
`PRODUCTION_JWT_SECRET_SHA256` / `PRODUCTION_PEER_JWT_SECRET_SHA256`. Each own
fingerprint must match the target host's `JWT_SECRET`, and each peer fingerprint
must equal the other environment's own fingerprint. Deployment validates this
before database migration and again before Compose mutation without printing
the secret or either fingerprint.

The protected environment variables `STAGING_PEER_DEPLOY_PATH` and
`PRODUCTION_PEER_DEPLOY_PATH` point to the other environment's application root
on the same host. The migration preflight and remote deploy script hash that
peer runtime env directly, so a fabricated peer fingerprint cannot satisfy the
isolation gate.

Unsafe browser requests are rejected before routing unless `Origin` or
`Referer` matches that origin. Cookie-free Bearer machine requests remain
available. Release smoke commands that connect through an SSH loopback tunnel
must pass the real public origin explicitly; `scripts/browser-auth-fixture.mjs`
uses `PUBLIC_HTTPS_ORIGIN` for the same purpose. A controlled domain remains the
final isolation and HSTS boundary.

## Backend Supabase runtime role

`SUPABASE_RUNTIME_KEY` is a private backend JWT. Its payload role must be
exactly `workbuddy_runtime` and it must have a future integer `exp`; an anon,
authenticated, service-role, malformed, or expired token is rejected before
database migration and again at API/worker startup. The token must never be
used as a `VITE_*` value or sent to a browser.

The local deployment guard validates compact JWT serialization and required
claims only. Supabase PostgREST remains responsible for cryptographically
verifying the JWT signature before it assumes the database role.

Migration `336_runtime_postgrest_role_boundary.sql` grants only the Supabase
PostgREST `authenticator` role permission to assume `workbuddy_runtime`. It
does not grant the backend role to `anon`, `authenticated`, or `service_role`.
Provision the signed runtime JWT through the protected environment and host
runtime-secret process; never substitute the public anon key. Keep the direct
database login on the separate `workbuddy_runtime_login` role.

The protected deployment workflow applies migration 336 only when the target
GitHub environment variable `MIGRATION_336_APPROVED_SHA` exactly matches the
release SHA. Production also requires `MIGRATION_336_STAGING_EVIDENCE_REF` to
contain the successful staging deployment run URL, keeping staging readback
and production promotion separate.

## Production Advisor ACL Remediation 308

Production migration 308 is a one-time bootstrap exception for the two
commercial trigger functions whose existing anon/authenticated execute grants
prevent a zero-issue Supabase Advisor export. Dispatch
`.github/workflows/production-advisor-acl-remediation.yml` only from the exact
current protected `main` SHA and enter
`APPLY_PRODUCTION_ADVISOR_ACL_REMEDIATION_308` in the protected Production
environment.

The workflow verifies the exact four known API-role exposures, applies only
`308_commercial_trigger_rpc_acl_closeout.sql`, then verifies that PUBLIC,
anon, and authenticated execute access is closed while existing backend runtime
roles retain execute. Before its first database connection, it also requires
`PRODUCTION_SUPABASE_URL` and `PRODUCTION_SUPABASE_MIGRATION_URL` to resolve to
the same Supabase project. A retry accepts only the matching hardened ACL plus
applied migration-ledger state; inconsistent ACL/ledger states fail closed. It
performs no SSH, container, ingress, or application deployment operation. After
it passes, refresh the Production Supabase Advisor export and require
zero security issues before using the normal deployment workflow. Do not reuse this
path for later migrations or bypass the normal Advisor gate.

## Advisor Function Hardening 334

Migration 334 has a database-only bootstrap workflow because its two mutable
function search paths and six effective anon/authenticated execute exposures are
the exact eight staging Advisor warnings that prevent the normal zero-issue
preflight. Dispatch `.github/workflows/advisor-function-hardening-334.yml` only
from the exact current protected `main` SHA. Select `staging` or `production`,
confirm a controlled low-traffic migration window, enter
`EXACT_8_WARNINGS_MATCH_MIGRATION_334`, and use the matching environment token:

- `APPLY_STAGING_ADVISOR_FUNCTION_HARDENING_334`
- `APPLY_PRODUCTION_ADVISOR_FUNCTION_HARDENING_334`

The workflow verifies that the public Supabase URL and privileged migration URL
resolve to the same target project. It accepts only the exact pending catalog
state or the exact hardened retry state, selects and applies only
`334_security_advisor_function_hardening.sql`, and then reads back the migration
ledger, both fixed `search_path` values, all closed PUBLIC/anon/authenticated
execute paths, and the retained `service_role` and `workbuddy_runtime` grants.
It performs no SSH, container, ingress, or application deployment operation.

After the workflow passes, rerun the matching Supabase Advisor, capture a fresh
Dashboard UI or Management API export with zero security issues, update the
protected environment Advisor secret, and only then run the normal same-SHA
deployment workflow. Staging must complete before the production token is used.

## Advisor Retirement-State RLS 335

Migration 335 is a staging-only database remediation for the internal
`duration_learning_legacy_runtime_retirement_state` table, which is intentionally
not a client data surface. Dispatch
`.github/workflows/advisor-retirement-state-rls-335.yml` only from the exact
current protected `main` SHA, confirm a controlled low-traffic migration window,
enter `EXACT_1_SECURITY_INFO_MATCH_MIGRATION_335`, and use:

- `APPLY_STAGING_ADVISOR_RETIREMENT_STATE_RLS_335`

The workflow verifies the exact staging Supabase target, selects and applies only
`335_duration_learning_retirement_state_rls_policy.sql`, and reads back the
ledger, enabled and forced RLS, and the explicit `USING (false)` / `WITH CHECK
(false)` policy. It grants no `anon` or `authenticated` access and performs no
application, host, ingress, or container mutation. After readback, rerun the
staging Security Advisor and refresh the protected Advisor export before the
normal same-SHA deployment workflow.

## Production runtime recovery

`.github/workflows/production-runtime-recovery.yml` is a manual, protected
SSH-based inspection of the existing Web, API, and worker containers and their local
`/api/readyz` probes. It also requires the public HTTPS readiness endpoint before
and after any recovery. The workflow uses the protected `production` GitHub environment
and the same production secret names as the release workflow:

- `PRODUCTION_DEPLOY_HOST`
- `PRODUCTION_DEPLOY_USER`
- `PRODUCTION_DEPLOY_PORT` (optional, defaults to `22`)
- `PRODUCTION_DEPLOY_PATH`
- `PRODUCTION_DEPLOY_SSH_PRIVATE_KEY`
- `PRODUCTION_DEPLOY_KNOWN_HOSTS`
- `PRODUCTION_DEPLOY_HEALTH_URL` (required; must be an HTTPS `/api/readyz` URL)
- `PRODUCTION_SUPABASE_URL` (required; supplies the expected production project identity)
- `PRODUCTION_SLACK_WEBHOOK` (optional notification channel)

The protected `PRODUCTION_DEPLOY_PUBLIC_HOST` environment variable must be
`zhuxucloud.com`. Both public probes require the canonical
`https://zhuxucloud.com/api/readyz` authority and validate the readyz target,
Supabase/database project refs, and release SHA. The post-recovery SHA must equal
the atomic current release reported by the remote recovery script.

Recovery is fail closed. SSH credentials, pinned host trust, the runtime env,
the atomic `current` release pointer and manifest, absence of a pending release,
the shared deployment lock, `SUPABASE_RUNTIME_KEY`, absence of
`SUPABASE_SERVICE_KEY`, Docker access, container Compose identities, the
`production` target, and matching current/Web/API/worker release identities must all
pass preflight. Recovery is manual-only and may recover only a service with an
explicit stopped, unhealthy, or failed local `readyz` diagnosis. A public probe
failure with all three local services healthy is reported as an ingress boundary
failure and does not restart containers.

Manual dispatch additionally requires environment `production`, one of the
`api`, `web`, `worker`, or `all` targets, and the exact confirmation phrase
`RESTART_PRODUCTION_RUNTIME`. The selected target still needs a matching
diagnosis; this is not an unconditional restart switch.

The recovery path only starts or restarts existing containers. It does not deploy
source, build images, recreate the Compose stack, or write the database.
Container status, health, local probes, and exit codes are recorded in a
sanitized report. In particular, exit code 137 is recorded as an exit code and
is not labeled as an out-of-memory event without separate evidence. Probe,
recovery, and verification notifications execute as independent jobs so one
notification failure cannot suppress a later stage.
