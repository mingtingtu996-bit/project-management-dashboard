# Split-Port IP Ingress Implementation Plan

> Superseded on 2026-07-19 after the user provisioned `zhuxucloud.com` and
> `staging.zhuxucloud.com`. The active implementation plan is
> `2026-07-19-domain-sni-ingress.md`; the temporary IP design remains only as
> historical rationale and must not drive the current release.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide isolated temporary production and staging TLS entry points on one public IPv4 address while keeping application ports loopback-only, reporting HSTS as inapplicable, and keeping every release/recovery path fail closed.

**Architecture:** A digest-pinned Caddy 2.10.2 host-network container owns public ports 80, 443, and 8443 and proxies only to loopback web ports 8080 and 8081. Port 80 uses a fixed staging redirect path instead of another public cleartext port. Deployment receives independent HTTPS health and HTTP redirect-source URLs, requires an explicit `temporary_ip_tls` or `domain_hsts` mode, reports IP-literal HSTS policy as inapplicable, production recovery requires the public probe, and environment-specific HTTP-only cookie names prevent overwrite while both cookies remain visible to both same-host ports.

**Tech Stack:** GitHub Actions, Bash, Docker Compose, Caddy 2.10.1+, Node.js test runner, TypeScript, Vitest.

## Global Constraints

- Production is `80 -> 443 -> 127.0.0.1:8080`.
- Staging redirect is `80/staging-redirect/* -> 8443 -> 127.0.0.1:8081`.
- Ports 8080 and 8081 remain loopback-only.
- Caddy ACME uses the `shortlived` profile and persistent storage.
- The ingress image is `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`.
- RFC 6797 HSTS policy is inapplicable to the IP literal; STS header presence never satisfies final domain HSTS closure.
- Explicit `temporary_ip_tls` mode may deploy with valid TLS, readyz, redirect, and same-SHA checks while reporting `domainHstsReady=false`.
- No workflow may use `ssh-keyscan` or disable strict host checking.
- Ingress provisioning never runs migrations, deploys application source, or writes application data.
- Every behavior change starts with a focused failing test.

---

### Task 1: Make Redirect Sources Explicit

**Files:**
- Create: `scripts/classify-public-ingress-url.mjs`
- Create: `scripts/classify-public-ingress-url.test.mjs`
- Modify: `server/src/__tests__/deployWorkflowContract.test.ts`
- Modify: `server/src/__tests__/runtimeDeploymentSecurityContract.test.ts`
- Modify: `scripts/deploy-lighthouse-server.sh`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `DEPLOY_HEALTH_URL` and the target-specific GitHub environment secrets.
- Produces: `DEPLOY_HTTP_REDIRECT_URL` in the workflow and `HTTP_REDIRECT_URL` in the remote script.

- [ ] **Step 1: Write failing static contracts**

Add unit cases proving an IPv4 or IPv6 literal returns
`hstsUserAgentPolicyApplicable=false` and passes only with expected mode
`temporary_ip_tls`, while a DNS hostname returns `true` and passes only with
expected mode `domain_hsts`.
Add assertions that the workflow requires the target-specific
`*_DEPLOY_HTTP_REDIRECT_URL`, passes `HTTP_REDIRECT_URL` to the remote script,
and that the script contains no `http://${HEALTH_URL#https://}` derivation.
Require an exact redirect comparison:

```ts
expect(deployScript).toContain(': "${HTTP_REDIRECT_URL:?External HTTP redirect URL is required}"')
expect(deployScript).not.toContain('HTTP_HEALTH_URL="http://${HEALTH_URL#https://}"')
expect(deployScript).toContain('if [ "$redirect_url" != "$HEALTH_URL" ]; then')
expect(deployScript).toContain('temporary_ip_tls')
expect(deployScript).toContain('domainHstsReady')
```

- [ ] **Step 2: Run the contracts and verify RED**

Run:

```powershell
node --test scripts/classify-public-ingress-url.test.mjs
npx vitest run --config server/vitest.config.ts server/src/__tests__/deployWorkflowContract.test.ts server/src/__tests__/runtimeDeploymentSecurityContract.test.ts
```

Expected: FAIL because the classifier, explicit ingress mode, and redirect-source
secret do not exist, the same-authority derivation remains, and an IP STS header
can still appear to satisfy final domain closure.

- [ ] **Step 3: Implement the minimum redirect contract**

In `scripts/deploy-lighthouse-server.sh`, require `HTTP_REDIRECT_URL`, validate it
starts with `http://`, request it with redirects disabled, and require the
returned `Location` to equal `HEALTH_URL` exactly. In `.github/workflows/deploy.yml`,
load `STAGING_DEPLOY_HTTP_REDIRECT_URL` or
`PRODUCTION_DEPLOY_HTTP_REDIRECT_URL`, include it in both preflight required
secret loops, and pass it as:

```bash
HTTP_REDIRECT_URL="${DEPLOY_HTTP_REDIRECT_URL}" \
HEALTH_URL="${DEPLOY_HEALTH_URL}" \
bash -s
```

Use `node:net.isIP` in `classify-public-ingress-url.mjs`; never classify by
substring. Invoke it in `deployment-target-preflight`, before the migration job
can start, and again in the remote script as defense in depth. The remote
deployment records `hstsHeaderPresent` independently. An IP URL passes only
when `public_ingress_mode=temporary_ip_tls`, with `temporaryIngressReady=true`
and `domainHstsReady=false`. A DNS URL passes only when
`public_ingress_mode=domain_hsts`, with HSTS header verification still required.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: both files pass.

- [ ] **Step 5: Commit**

```powershell
git add scripts/classify-public-ingress-url.mjs scripts/classify-public-ingress-url.test.mjs scripts/deploy-lighthouse-server.sh .github/workflows/deploy.yml server/src/__tests__/deployWorkflowContract.test.ts server/src/__tests__/runtimeDeploymentSecurityContract.test.ts
git commit -m "fix: support split-port HTTPS redirects"
```

### Task 2: Select Authentication Cookies By Environment

**Files:**
- Create: `server/src/__tests__/authRuntimeConfiguration.test.ts`
- Create: `server/src/__tests__/requestOriginGuard.test.ts`
- Create: `server/src/middleware/requestOriginGuard.ts`
- Create: `scripts/public-origin.mjs`
- Create: `scripts/public-origin.contract.test.mjs`
- Modify: `server/src/auth/config.ts`
- Modify: `server/src/auth/http.ts`
- Modify: `server/src/index.ts`
- Modify: `deploy/env/server.production.example`
- Modify: `scripts/deploy-lighthouse-server.sh`
- Modify: `scripts/run-wizard-baseline-revision-staging.mjs`
- Modify: `scripts/browser-auth-fixture.mjs`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/production-livegate-execution.yml`
- Modify: `server/src/__tests__/deployWorkflowContract.test.ts`
- Modify: `deploy/README.md`

**Interfaces:**
- Consumes: `AUTH_COOKIE_NAME` from the runtime environment.
- Produces: `JWT_CONFIG.cookie.name`, shared by login, extraction, refresh, and logout.
- Consumes: target-specific JWT issuer/audience/secret and exact public HTTPS origin.
- Produces: a pre-route unsafe-method Origin guard and loopback-safe release smoke headers.

- [ ] **Step 1: Write failing cookie tests**

Use isolated module imports after setting `process.env.AUTH_COOKIE_NAME`. Verify
`workbuddy_production_auth_token` is used by `setAuthTokenCookie` and
`clearAuthTokenCookie`; verify test mode defaults to `auth_token`; verify an
invalid name such as `bad cookie` throws before a response cookie is written.
The test must not claim port-level cookie isolation; it proves only that each API
selects its configured name.
Add deployment-contract cases requiring production to use
`workbuddy_production_auth_token` and staging to use
`workbuddy_staging_auth_token`; either environment using the other name must
fail before source or database mutation.
Add RED cases for missing or multi-value CORS, staging/production origin swaps,
unsafe cross-origin mutations, and loopback login without the external Origin.
Enumerate every staging and production wizard smoke/cleanup command and require
all four loopback calls to pass `--public-origin`.

- [ ] **Step 2: Run the test and verify RED**

```powershell
npx vitest run --config server/vitest.config.ts server/src/__tests__/authRuntimeConfiguration.test.ts
```

Expected: FAIL because `server/src/auth/http.ts` still hardcodes `auth_token`.

- [ ] **Step 3: Implement one validated cookie-name source**

Add a getter to `JWT_CONFIG.cookie.name` that validates this RFC token-safe
pattern:

```ts
/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u
```

In production, reject a missing name; in development/test, default to
`auth_token`. Replace both hardcoded names
in `server/src/auth/http.ts` with `JWT_CONFIG.cookie.name`. Require
`AUTH_COOKIE_NAME` in the remote runtime env preflight. Derive the one allowed
value from `DEPLOY_TARGET` inside the deployment script and require exact
equality; do not accept an arbitrary token-safe production value. Document
exact values:

```text
production: workbuddy_production_auth_token
staging: workbuddy_staging_auth_token
```

Require target-specific JWT issuer and audience, independent secrets, a single
exact HTTPS `PUBLIC_HTTPS_ORIGIN`, and `CORS_ORIGIN` equality at runtime startup.
Install the Origin guard before CORS and route handlers. Add the shared strict
HTTPS-origin parser to the official wizard smoke and browser auth fixture; do
not exempt login when Origin is missing.

- [ ] **Step 4: Run cookie and existing auth regression tests**

```powershell
npx vitest run --config server/vitest.config.ts server/src/__tests__/authRuntimeConfiguration.test.ts server/src/__tests__/requestOriginGuard.test.ts server/src/__tests__/authCredentialRevocation.test.ts server/src/__tests__/authLoginRoute.test.ts server/src/__tests__/authRegisterRoute.test.ts server/src/__tests__/deployWorkflowContract.test.ts
node --test scripts/public-origin.contract.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add server/src/auth/config.ts server/src/auth/http.ts server/src/__tests__/authCookieConfiguration.test.ts deploy/env/server.production.example scripts/deploy-lighthouse-server.sh deploy/README.md
git commit -m "fix: isolate auth cookies by deployment target"
```

### Task 3: Add The Pinned Split-Port Caddy Runtime

**Files:**
- Create: `deploy/ingress/Caddyfile`
- Create: `deploy/docker-compose.ingress.yml`
- Create: `deploy/env/ingress.example`
- Create: `scripts/split-port-ip-ingress.contract.test.mjs`
- Modify: `.github/workflows/workflow-guard.yml`
- Modify: `deploy/README.md`

**Interfaces:**
- Consumes: `WORKBUDDY_PUBLIC_IPV4`, `CADDY_ACME_EMAIL`, and persistent Caddy data/config directories.
- Produces: four public listeners with exact redirect/proxy boundaries.

- [ ] **Step 1: Write the failing ingress contract**

Assert that the Compose file pins
`caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`, uses host
networking only in the ingress Compose project, mounts `/data` and `/config`,
and never references database/runtime credentials. Assert that the Caddyfile
contains explicit listeners for 80, 443, and 8443, a fixed
`/staging-redirect/*` 308 rule, the `shortlived` profile, and only the two
loopback upstreams. Assert it does not listen on 8082.

- [ ] **Step 2: Run the contract and verify RED**

```powershell
node --test scripts/split-port-ip-ingress.contract.test.mjs
```

Expected: FAIL because the ingress files do not exist.

- [ ] **Step 3: Add the minimal ingress runtime**

Create the Caddyfile with `auto_https disable_redirects`, an explicit port 80
route that sends the staging prefix to 8443 and all other requests to 443, two
TLS site blocks, and:

```caddyfile
tls {
  issuer acme {
    profile shortlived
  }
}
```

Create a separate Compose service using `network_mode: host`, persistent
volumes, restart policy, log rotation, and required environment values. Keep
the application Compose file unchanged.

- [ ] **Step 4: Register the contract in Workflow Guard and verify GREEN**

Run:

```powershell
node --test scripts/split-port-ip-ingress.contract.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add deploy/ingress/Caddyfile deploy/docker-compose.ingress.yml deploy/env/ingress.example deploy/README.md scripts/split-port-ip-ingress.contract.test.mjs .github/workflows/workflow-guard.yml
git commit -m "feat: add split-port Caddy ingress"
```

### Task 4: Add Fail-Closed Ingress Provisioning

**Files:**
- Create: `scripts/provision-lighthouse-ip-ingress.sh`
- Create: `.github/workflows/provision-split-port-ip-ingress.yml`
- Modify: `scripts/split-port-ip-ingress.contract.test.mjs`

**Interfaces:**
- Consumes: immutable release SHA, production SSH secrets, `WORKBUDDY_PUBLIC_IPV4`, `CADDY_ACME_EMAIL`, and the exact confirmation `PROVISION_SPLIT_PORT_IP_INGRESS`.
- Produces: validated host ingress configuration plus a sanitized provisioning artifact.

- [ ] **Step 1: Extend the contract with provisioning failures**

Require `workflow_dispatch`, `environment: production`, concurrency, exact
confirmation and SHA checks, pinned known-hosts, no `ssh-keyscan`, candidate
Caddy validation before activation, a previous-config SHA backup, rollback on
probe failure, separate `hstsHeaderPresent` and
`hstsUserAgentPolicyApplicable=false` fields, and an explicit mutation boundary
excluding source/database writes.

- [ ] **Step 2: Run the contract and verify RED**

```powershell
node --test scripts/split-port-ip-ingress.contract.test.mjs
```

Expected: FAIL because the provision script and workflow do not exist.

- [ ] **Step 3: Implement candidate/activate/rollback provisioning**

The script installs only the tracked ingress Compose and Caddy files under
`/opt/workbuddy-ingress/releases/$RELEASE_SHA`, writes a mode-600 runtime env,
validates with `docker compose config` and `caddy validate`, atomically switches
the `current` symlink, starts the ingress project, and probes all four public
boundaries. A trap restores the previous symlink and starts the previous config
if activation or probes fail.

- [ ] **Step 4: Implement the protected manual workflow**

The workflow checks out the requested main SHA, verifies it equals
`github.sha`, uses only the pinned known-hosts secret, sends tracked files over
SSH without printing secret values, propagates the remote exit code, and
uploads only booleans, version, SHA, and certificate metadata.

- [ ] **Step 5: Run the contract and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add scripts/provision-lighthouse-ip-ingress.sh .github/workflows/provision-split-port-ip-ingress.yml scripts/split-port-ip-ingress.contract.test.mjs
git commit -m "feat: provision split-port ingress safely"
```

### Task 5: Make Production Recovery Public-HTTPS Authoritative

**Files:**
- Modify: `scripts/production-runtime-recovery.contract.test.mjs`
- Modify: `scripts/recover-production-runtime.sh`
- Modify: `.github/workflows/production-runtime-recovery.yml`
- Modify: `deploy/README.md`

**Interfaces:**
- Consumes: mandatory `PRODUCTION_DEPLOY_HEALTH_URL`.
- Produces: recovery summaries that can be healthy only when both local and public probes pass.

- [ ] **Step 1: Invert the existing optional-probe contract to RED**

Require `DEPLOY_HEALTH_URL` in the preflight secret loop, reject missing/non-HTTPS
values, and assert:

```js
assert.match(workflow, /preflightPassed && localVerificationPassed && publicProbeConfigured && publicProbeAfterPassed/)
assert.doesNotMatch(workflow, /!publicProbeConfigured \|\| publicProbeAfterPassed/)
```

Also assert the remote script rejects `PUBLIC_PROBE_CONFIGURED!=true`, never
names a local-only result `healthy_no_action`, and cannot set final recovery
success from `local_verification_passed` alone.

- [ ] **Step 2: Run the contract and verify RED**

```powershell
node --test scripts/production-runtime-recovery.contract.test.mjs
```

Expected: FAIL because public HTTPS remains optional.

- [ ] **Step 3: Implement mandatory public verification**

Require the URL in preflight, always run before/after probes, classify missing
configuration as blocked and failed public reachability as ingress failure,
and require public probe success in `runtimeHealthy`. Update the remote script
so missing public-probe configuration exits nonzero before inspection, local
health alone is reported only as `local_runtime_healthy`, and post-recovery
local verification is never named final success. The workflow performs the
authoritative after-probe and combines it with the remote local result. Keep the
rule that healthy local containers plus failed ingress does not restart
application containers.

- [ ] **Step 4: Run the contract and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add scripts/production-runtime-recovery.contract.test.mjs scripts/recover-production-runtime.sh .github/workflows/production-runtime-recovery.yml deploy/README.md
git commit -m "fix: require public HTTPS in runtime recovery"
```

### Task 6: Verify The Complete Option 2 Change

**Files:**
- Verify only; fix only failures caused by Tasks 1-5.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: a clean immutable commit eligible for PR and CI.

- [ ] **Step 1: Run focused contracts**

```powershell
node --test scripts/split-port-ip-ingress.contract.test.mjs scripts/production-runtime-recovery.contract.test.mjs
npx vitest run --config server/vitest.config.ts server/src/__tests__/deployWorkflowContract.test.ts server/src/__tests__/runtimeDeploymentSecurityContract.test.ts server/src/__tests__/authCookieConfiguration.test.ts server/src/__tests__/authCredentialRevocation.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run server typecheck and workflow gate**

```powershell
npx tsc -p server/tsconfig.json --noEmit
npm run verify:workflow-contract
```

Expected: exit 0.

- [ ] **Step 3: Run the release suite**

```powershell
npm run test:release --workspace=server
```

Expected: exit 0 with only the governed project-search exclusions.

- [ ] **Step 4: Audit the immutable tree**

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: no unstaged or untracked files and no secret values in the diff.

- [ ] **Step 5: Push and open a PR**

Push `codex/unified-duration-production-closure`, open a PR against `main`, and
wait for Workflow Guard plus server/client/browser quality checks. Do not write
host configuration, GitHub environment values, migrations, or application data
until the final merged main SHA is known.
