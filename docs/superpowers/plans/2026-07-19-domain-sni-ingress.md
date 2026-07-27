# Domain SNI Ingress And Release Plan

**Goal:** Publish production and staging through two real DNS names on one
Lighthouse IPv4 address, then deploy the same immutable main release through
the existing migration and live gates.

**Architecture:** Caddy owns host ports 80 and 443. SNI routes
`zhuxucloud.com` to `127.0.0.1:8080` and `staging.zhuxucloud.com` to
`127.0.0.1:8081`. Both application ports remain loopback-only. HTTP returns an
exact 308 to the same host and path over HTTPS. Domain TLS and HSTS are hard
release requirements.

## Constraints

- DNS, TLS, redirect, HSTS, readyz identity, and release SHA are separate gates.
- Ingress provisioning never runs migrations or deploys application source.
- The first ingress activation may classify a verified HTTPS 502 as
  `ingress_ready_upstream_unavailable`; it is not application health.
- Only an explicit one-time bootstrap confirmation may let that 502 reach the
  migration/deploy sequence. Ordinary upgrades require the old public readyz.
- Postdeploy public readyz must report `status=ready`, the new release SHA, the
  correct deployment target, and matching Supabase/runtime database refs.
- Caddy activation uses a candidate directory, validation, an atomic `current`
  symlink, a pending activation record, and public-runner rollback.
- Application release and production recovery must be independently rollback
  capable and public HTTPS authoritative.
- No host, GitHub environment, database, or container writes occur before the
  final merged main SHA and its required quality gates are known.

## Execution

- [x] Preserve environment-specific auth, exact Origin checks, and SSH tunnel
  HTTPS semantics in release/UAT tooling.
- [x] Add digest-pinned Caddy Compose, two-host Caddyfile, and a protected
  candidate/activate/public-probe/rollback workflow.
- [x] Add explicit first-bootstrap classification and public postdeploy identity
  checks.
- [ ] Make application archive deployment atomic with previous-release restore.
- [ ] Make production recovery require public HTTPS before final health.
- [ ] Run focused contracts, server/client release tests, workflow guard, and
  repository secret scan.
- [ ] Push, open a PR, merge only after review, then wait for the new main push
  quality run.
- [ ] Configure environment URLs/hosts and runtime credentials without exposing
  values; back up host env before any change.
- [ ] Provision Caddy, deploy staging and verify it, then deploy production and
  verify migrations, Advisor, TLS/HSTS, readyz identity, login, and rollback.

## Current External State

- Both A records resolve to `124.222.54.190`; no AAAA or CAA restriction was
  observed in the read-only checks.
- SSH port 22 is reachable, while public 80/443 are not yet reachable.
- This proves DNS readiness only. It does not prove cloud firewall, host
  firewall, Caddy, certificate issuance, or application readiness.
