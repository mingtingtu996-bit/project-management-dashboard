#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-}"
CONFIRMATION="${2:-}"

case "$CONFIRMATION" in
  "") bootstrap_mode=false ;;
  PRODUCTION_EMPTY_ROOT_BOOTSTRAP) bootstrap_mode=true ;;
  *) echo "Production empty-root bootstrap confirmation is invalid." >&2; exit 1 ;;
esac

case "$APP_DIR" in
  "") echo "Application root is required." >&2; exit 1 ;;
  "~") APP_DIR="$HOME" ;;
  "~/"*) APP_DIR="$HOME/${APP_DIR#"~/"}" ;;
esac

[ -d "$APP_DIR" ] || { echo "Production application root does not exist." >&2; exit 1; }
APP_DIR="$(cd "$APP_DIR" && pwd -P)"

fail() {
  echo "Production empty-root bootstrap preflight failed: $1" >&2
  exit 1
}

read_first_entry() {
  local directory="$1"
  if [ ! -e "$directory" ] && [ ! -L "$directory" ]; then
    return 0
  fi
  [ -d "$directory" ] && [ ! -L "$directory" ] || return 1
  find "$directory" -mindepth 1 -maxdepth 1 -print -quit
}

read_release_sha() {
  command -v python3 >/dev/null 2>&1 || return 1
  python3 -c '
import json
import re
import sys

value = json.load(sys.stdin).get("releaseSha", "")
if not re.fullmatch(r"[0-9a-f]{40}", value):
    raise SystemExit(1)
print(value, end="")
' < "$1"
}

read_compose_contract() {
  local root="$1" compose_json
  compose_json="$(RELEASE_SHA=0000000000000000000000000000000000000000 \
    DEPLOY_TARGET=production \
    EXPECTED_SCHEMA_MIGRATION_FILENAME=000_contract.sql \
    EXPECTED_SCHEMA_MIGRATION_CHECKSUM=0000000000000000000000000000000000000000000000000000000000000000 \
    "${docker_command[@]}" compose \
      --env-file "$root/deploy/env/server.production.env" \
      -f "$root/deploy/docker-compose.lighthouse.yml" \
      config --no-env-resolution --format json 2>/dev/null)" || return 1
  COMPOSE_JSON="$compose_json" RELEASE_ROOT="$root" python3 -c '
import json
import os

services = json.loads(os.environ["COMPOSE_JSON"]).get("services") or {}
expected = {
    "api": ("server", "prebuilt-runtime"),
    "worker": ("server", "prebuilt-runtime"),
    "web": ("client", "prebuilt-runtime"),
}
root = os.path.realpath(os.environ["RELEASE_ROOT"])
for name, (directory, target) in expected.items():
    build = (services.get(name) or {}).get("build") or {}
    context = build.get("context")
    if not isinstance(context, str):
        raise SystemExit(1)
    if not os.path.isabs(context):
        context = os.path.join(root, "deploy", context)
    if os.path.realpath(context) != os.path.join(root, directory) or build.get("target") != target:
        raise SystemExit(1)
' >/dev/null
}

has_rollback_contract() {
  local root="$1" frontend_sha server_sha migration_entry
  [ -d "$root" ] || return 1
  [ -f "$root/client/dist/workbuddy-build.json" ] || return 1
  [ -f "$root/client/dist/index.html" ] || return 1
  [ -f "$root/client/Dockerfile" ] || return 1
  [ -f "$root/client/nginx.conf" ] || return 1
  [ -f "$root/deploy/docker-compose.lighthouse.yml" ] || return 1
  [ -f "$root/deploy/env/server.production.env" ] || return 1
  [ -f "$root/deploy/nginx/lighthouse.conf" ] || return 1
  [ -f "$root/scripts/classify-public-ingress-url.mjs" ] || return 1
  frontend_sha="$(read_release_sha "$root/client/dist/workbuddy-build.json")" || return 1
  [ -f "$root/server/Dockerfile" ] || return 1
  [ -f "$root/server/package.json" ] || return 1
  [ -f "$root/server/package-lock.json" ] || return 1
  [ -f "$root/server/dist/index.js" ] || return 1
  [ -f "$root/server/dist/workbuddy-server-build.json" ] || return 1
  server_sha="$(read_release_sha "$root/server/dist/workbuddy-server-build.json")" || return 1
  [ "$server_sha" = "$frontend_sha" ] || return 1
  [ -d "$root/server/migrations" ] && [ ! -L "$root/server/migrations" ] || return 1
  migration_entry="$(find "$root/server/migrations" -maxdepth 1 -type f -name '[0-9]*_*.sql' -print -quit)" \
    || return 1
  [ -n "$migration_entry" ] || return 1
  read_compose_contract "$root"
}

if [ -e "$APP_DIR/current.next" ] || [ -L "$APP_DIR/current.next" ]; then
  fail "pending current pointer already exists"
fi
[ ! -e "$APP_DIR/pending-application-release.env" ] \
  && [ ! -L "$APP_DIR/pending-application-release.env" ] \
  || fail "pending application activation already exists"

lock_file="$APP_DIR/.deploy.lock"
if [ -e "$lock_file" ] || [ -L "$lock_file" ]; then
  [ -f "$lock_file" ] || fail "deployment lock cannot be inspected"
  exec 9<"$lock_file" || fail "deployment lock cannot be inspected"
  if ! flock -n 9; then
    exec 9<&-
    fail "another deployment holds the deployment lock"
  fi
  exec 9<&-
fi

release_entry="$(read_first_entry "$APP_DIR/releases")" \
  || fail "managed release directory cannot be inspected"
failed_release_entry="$(read_first_entry "$APP_DIR/failed-releases")" \
  || fail "failed release directory cannot be inspected"

if docker info >/dev/null 2>&1; then
  docker_command=(docker)
elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
  docker_command=(sudo -n docker)
else
  fail "Docker is not available for rollback or target-container inspection"
fi

if [ "$bootstrap_mode" != true ]; then
  if [ -e "$APP_DIR/current" ] || [ -L "$APP_DIR/current" ]; then
    [ -L "$APP_DIR/current" ] || fail "managed current pointer is not a symlink"
    current_target="$(readlink -f "$APP_DIR/current")" \
      || fail "managed current pointer cannot be resolved"
    case "$current_target" in
      "$APP_DIR/releases/"*) ;;
      *) fail "managed current pointer is outside the releases directory" ;;
    esac
    [ -d "$current_target" ] || fail "managed current release directory is missing"
    has_rollback_contract "$current_target" \
      || fail "managed current release is not rollback-capable"
    printf '%s\n' '{"status":"production_upgrade_root_ready","rollbackSource":"managed_current","pendingActivation":false,"deploymentLockHeld":false}'
    exit 0
  fi
  if [ -n "$release_entry" ]; then
    fail "managed release entries exist without a current pointer"
  fi
  if has_rollback_contract "$APP_DIR"; then
    printf '%s\n' '{"status":"production_upgrade_root_ready","rollbackSource":"legacy_tree","pendingActivation":false,"deploymentLockHeld":false}'
    exit 0
  fi
  fail "no rollback-capable production release exists; exact empty-root bootstrap authorization is required"
fi

if [ -e "$APP_DIR/current" ] || [ -L "$APP_DIR/current" ]; then
  fail "managed current pointer already exists"
fi
if [ -n "$release_entry" ]; then
  fail "managed release entries already exist"
fi
if [ -n "$failed_release_entry" ]; then
  fail "failed managed releases already exist"
fi

for legacy_path in \
  "$APP_DIR/client" \
  "$APP_DIR/server" \
  "$APP_DIR/scripts" \
  "$APP_DIR/package.json" \
  "$APP_DIR/deploy/docker-compose.lighthouse.yml"; do
  if [ -e "$legacy_path" ] || [ -L "$legacy_path" ]; then
    fail "legacy application tree is present"
  fi
done

command -v ss >/dev/null 2>&1 || fail "ss is required to inspect the production upstream port"
socket_table="$(ss -H -ltn 2>/dev/null)" || fail "unable to inspect listening TCP sockets"
if printf '%s\n' "$socket_table" | grep -Eq '(^|[[:space:]])(\*|[^[:space:]]*:)8080([[:space:]]|$)'; then
  fail "production upstream port 8080 is already listening"
fi

container_rows="$("${docker_command[@]}" ps -a --format '{{.Names}}\t{{.Label "com.docker.compose.project"}}')" \
  || fail "unable to inspect Docker containers"
target_container_count=0
while IFS=$'\t' read -r container_name compose_project_name; do
  [ -n "$container_name" ] || continue
  if [ "$compose_project_name" = project-management ] \
    || { [[ "$container_name" == project-management-* ]] \
      && [[ "$container_name" != project-management-staging-* ]]; }; then
    target_container_count=$((target_container_count + 1))
  fi
done <<< "$container_rows"
if [ "$target_container_count" -ne 0 ]; then
  fail "existing production target containers are present"
fi

printf '%s\n' '{"status":"production_empty_root_bootstrap_ready","currentRelease":false,"releaseCount":0,"pendingActivation":false,"deploymentLockHeld":false,"upstreamPort":8080,"upstreamListening":false,"targetContainerCount":0}'
