# Split-Port IP Ingress Design

## Status

Approved on 2026-07-19 as option 2. This is an interim public-IP TLS boundary,
not HSTS closure and not a production-ready replacement for a controlled
domain. A later domain migration must preserve the same production/staging
isolation and replace only the public authorities and certificate issuer input.

## Goals

- Restore a valid public TLS entry point without inventing a domain that the
  operator does not control.
- Keep production and staging isolated on the same host and public IPv4
  address.
- Preserve loopback-only application ports and exact release/database identity
  checks.
- Fail closed when TLS, redirect, public readiness, cookie isolation, runtime
  credentials, or certificate renewal health is missing.

## Topology

| Environment | Public HTTP redirect source | Public HTTPS | Loopback upstream |
| --- | --- | --- | --- |
| production | `http://<ip>:80` | `https://<ip>:443` | `127.0.0.1:8080` |
| staging | `http://<ip>:80/staging-redirect/*` | `https://<ip>:8443` | `127.0.0.1:8081` |

The shared port 80 listener redirects normal paths to production HTTPS and a
fixed `/staging-redirect/*` path to the staging HTTPS authority. Port `8443`
never accepts cleartext HTTP. Application Compose services remain bound only to
loopback and are not exposed by a cloud security group or host firewall.

## Ingress Runtime

- Run the official Caddy image pinned as
  `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`
  in a separate host-level Compose project.
- Use host networking only for the ingress container so it can reach the two
  loopback upstreams. API, worker, and web containers keep their existing
  isolated networking.
- Persist Caddy data and configuration outside the release checkout so a source
  deployment cannot erase ACME account or certificate state.
- Configure the ACME `shortlived` profile for public IP certificates. An ACME
  contact email is required through a protected environment secret.
- Disable implicit redirects and declare the shared `80` redirect listener
  explicitly. This prevents the old same-authority port rewrite bug without
  opening an extra public cleartext port.
- Proxy HTTP and WebSocket traffic with `X-Forwarded-Proto: https`.
- Record `hstsHeaderPresent` separately from
  `hstsUserAgentPolicyApplicable`. RFC 6797 sections 8.1.1 and 8.3 require the
  latter to be false for an IPv4 or IP-literal URI even if the response carries
  a Strict-Transport-Security header.

## Deployment Contract

Each environment has two explicit public probe inputs:

- `*_DEPLOY_HEALTH_URL`: exact HTTPS `/api/readyz` URL.
- `*_DEPLOY_HTTP_REDIRECT_URL`: exact HTTP `/api/readyz` redirect source.

The deployment script must not derive one from the other. It validates:

1. the internal loopback `/api/readyz` response;
2. the public HTTPS response, certificate, release SHA, deploy target, Supabase
   project ref, and database project ref;
3. a non-following request to the explicit HTTP source returns 301, 302, 307,
   or 308;
4. the redirect target exactly equals the HTTPS health URL, including scheme,
   host, port, path, and query;
5. the performance summary is read from the same HTTPS origin;
6. an IP-literal report is classified as
   `hstsUserAgentPolicyApplicable=false` and cannot satisfy a production HSTS
   readiness gate merely because an STS header is present.

Ingress provisioning is a separate manually dispatched operation protected by
the GitHub `production` environment. It requires an exact confirmation phrase,
pinned SSH host trust, a clean immutable main SHA, and a successful workflow
guard. It may update only the ingress Compose/configuration boundary. It does
not deploy application source, run migrations, or write application data.

## Cookie Isolation

Browser cookies do not distinguish ports. Production and staging therefore use
different HTTP-only cookie names supplied as `AUTH_COOKIE_NAME` in each runtime
environment. Production startup and deployment fail closed if the value is
missing or unsafe. Development and test retain the existing `auth_token`
default. The login, token extraction, and logout paths all read the same
validated configuration value.

## Recovery And Renewal

- Production recovery requires a configured public HTTPS readyz probe and may
  never report healthy from private container probes alone.
- A public-probe failure with healthy containers is classified as an ingress
  failure and does not trigger an application restart.
- Certificate checks record issuer, fingerprint, and expiry without logging
  credentials. They fail when a certificate is expired, not yet valid, for the
  wrong IP, or inside the configured minimum renewal horizon.
- Caddy automatic renewal remains authoritative. A controlled renewal drill
  reloads the pinned ingress runtime, preserves storage, and proves both public
  endpoints remain valid. Certificate rollover is recorded when the short-lived
  renewal window is reached; certificate storage is never deleted to force an
  issuance.

## Failure And Rollback

- Provisioning validates the candidate Caddy configuration before replacing the
  active file.
- The previous ingress configuration is backed up with SHA-256 and restored if
  reload or either public probe fails.
- Firewall changes are limited to `80`, `443`, and `8443`; loopback
  `8080/8081` remain non-public. Cloud firewall changes require their own
  control-plane evidence and are not inferred from host firewall success.
- The IP TLS boundary may restore encrypted access, but production readiness
  remains degraded while HSTS policy is inapplicable. No report or workflow may
  rename header presence to HSTS enforcement. Domain ingress is required to
  close that gate.
- Ingress provisioning, existing-runtime recovery, and staging deployment may
  proceed after their own guards pass. A new production application deployment
  remains blocked with `hsts_policy_inapplicable_ip_literal` until its public
  authority is a controlled DNS name.
- Application deploy and database migration remain blocked until the ingress
  contract, runtime role credential, advisor, backup, rollback, and same-SHA
  gates all pass.

## Verification

- Static contracts reject derived HTTP URLs, optional public recovery probes,
  duplicate production/staging cookie names, unpinned Caddy versions, and
  non-loopback application ports.
- Script tests cover standard-port production and split-port staging redirects,
  wrong redirect targets, missing probe inputs, TLS failures, incorrect HSTS
  applicability classification, and release identity mismatches.
- Workflow contracts cover manual approval, exact confirmation, pinned
  known-hosts, no `ssh-keyscan` fallback, status propagation, and no migration or
  application source mutation in ingress provisioning.
- Evidence contracts require both `hstsHeaderPresent` and
  `hstsUserAgentPolicyApplicable`; the IP-literal value for the latter is always
  false and therefore cannot produce a fully production-ready result.
- A fresh release SHA must pass focused tests, server typecheck, release tests,
  workflow contracts, and clean CI before any host, secret, migration, or
  deployment write.
