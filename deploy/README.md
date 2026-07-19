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

Unsafe browser requests are rejected before routing unless `Origin` or
`Referer` matches that origin. Cookie-free Bearer machine requests remain
available. Release smoke commands that connect through an SSH loopback tunnel
must pass the real public origin explicitly; `scripts/browser-auth-fixture.mjs`
uses `PUBLIC_HTTPS_ORIGIN` for the same purpose. A controlled domain remains the
final isolation and HSTS boundary.

## Production runtime recovery

`.github/workflows/production-runtime-recovery.yml` runs an hourly SSH-based
inspection of the existing Web, API, and worker containers and their local
`/api/readyz` probes. When a public health URL is configured, it also verifies
that HTTPS endpoint. The workflow uses the protected `production` GitHub environment
and the same production secret names as the release workflow:

- `PRODUCTION_DEPLOY_HOST`
- `PRODUCTION_DEPLOY_USER`
- `PRODUCTION_DEPLOY_PORT` (optional, defaults to `22`)
- `PRODUCTION_DEPLOY_PATH`
- `PRODUCTION_DEPLOY_SSH_PRIVATE_KEY`
- `PRODUCTION_DEPLOY_KNOWN_HOSTS`
- `PRODUCTION_DEPLOY_HEALTH_URL` (optional; when set, must be an HTTPS `/api/readyz` URL)
- `PRODUCTION_SLACK_WEBHOOK` (optional notification channel)

Recovery is fail closed. SSH credentials, pinned host trust, the runtime env,
the atomic `current` release pointer and manifest, absence of a pending release,
the shared deployment lock, `SUPABASE_RUNTIME_KEY`, absence of
`SUPABASE_SERVICE_KEY`, Docker access, container Compose identities, the
`production` target, and matching current/API/worker release identities must all
pass preflight. A scheduled run may
recover only a service with an explicit stopped, unhealthy, or failed local
`readyz` diagnosis. When a public probe is configured, its failure with all
three local services healthy is reported as an ingress boundary failure and
does not restart containers. Without it, local container verification is authoritative.

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
