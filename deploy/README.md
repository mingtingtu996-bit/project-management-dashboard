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

## Production runtime recovery

`.github/workflows/production-runtime-recovery.yml` runs an hourly public
HTTPS `/api/readyz` probe and then inspects the existing Web, API, and worker
containers. The workflow uses the protected `production` GitHub environment
and the same production secret names as the release workflow:

- `PRODUCTION_DEPLOY_HOST`
- `PRODUCTION_DEPLOY_USER`
- `PRODUCTION_DEPLOY_PORT` (optional, defaults to `22`)
- `PRODUCTION_DEPLOY_PATH`
- `PRODUCTION_DEPLOY_SSH_PRIVATE_KEY`
- `PRODUCTION_DEPLOY_KNOWN_HOSTS`
- `PRODUCTION_DEPLOY_HEALTH_URL` (required to be an HTTPS `/api/readyz` URL)
- `PRODUCTION_SLACK_WEBHOOK` (optional notification channel)

Recovery is fail closed. SSH credentials, pinned host trust, the runtime env
file, `SUPABASE_RUNTIME_KEY`, the absence of `SUPABASE_SERVICE_KEY`, Docker
access, container Compose identities, the `production` target, and matching
API/worker release identities must all pass preflight. A scheduled run may
recover only a service with an explicit stopped, unhealthy, or failed local
`readyz` diagnosis. A public failure with all three local services healthy is
reported as an ingress boundary failure and does not restart containers.

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
