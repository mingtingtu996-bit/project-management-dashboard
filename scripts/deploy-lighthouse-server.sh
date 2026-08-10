#!/usr/bin/env bash
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${DEPLOY_TARGET:?DEPLOY_TARGET is required}"
: "${RELEASE_ARCHIVE:?RELEASE_ARCHIVE is required}"

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.lighthouse.yml}"
ENV_FILE="${ENV_FILE:-deploy/env/server.production.env}"
HEALTH_URL="${HEALTH_URL:-}"
HTTP_REDIRECT_URL="${HTTP_REDIRECT_URL:-}"
PUBLIC_INGRESS_MODE="${PUBLIC_INGRESS_MODE:-}"
EXPECTED_PUBLIC_HOST="${EXPECTED_PUBLIC_HOST:-}"
INITIAL_RUNTIME_BOOTSTRAP="${INITIAL_RUNTIME_BOOTSTRAP:-false}"
ORIGIN_INGRESS_IP="${ORIGIN_INGRESS_IP:-}"
EXPECTED_JWT_SECRET_SHA256="${EXPECTED_JWT_SECRET_SHA256:-}"
PEER_JWT_SECRET_SHA256="${PEER_JWT_SECRET_SHA256:-}"
PEER_RUNTIME_ENV_FILE="${PEER_RUNTIME_ENV_FILE:-}"

require_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || {
    echo "Release SHA must be a full lowercase Git SHA." >&2
    return 1
  }
}

require_sha "$RELEASE_SHA"
: "${HEALTH_URL:?External HTTPS HEALTH_URL is required}"
: "${HTTP_REDIRECT_URL:?External HTTP redirect URL is required}"
: "${PUBLIC_INGRESS_MODE:?PUBLIC_INGRESS_MODE is required}"
: "${EXPECTED_PUBLIC_HOST:?EXPECTED_PUBLIC_HOST is required}"
: "${PEER_RUNTIME_ENV_FILE:?PEER_RUNTIME_ENV_FILE is required}"
case "$HEALTH_URL" in https://*) ;; *) echo "External deployment health URL must use https://." >&2; exit 1 ;; esac
case "$HTTP_REDIRECT_URL" in http://*) ;; *) echo "External deployment redirect URL must use http://." >&2; exit 1 ;; esac
case "$PUBLIC_INGRESS_MODE" in domain_hsts|temporary_ip_tls) ;; *) echo "Unsupported PUBLIC_INGRESS_MODE." >&2; exit 1 ;; esac
case "$INITIAL_RUNTIME_BOOTSTRAP" in true|false) ;; *) echo "INITIAL_RUNTIME_BOOTSTRAP must be true or false." >&2; exit 1 ;; esac
if [ "$INITIAL_RUNTIME_BOOTSTRAP" = true ]; then
  [ "$DEPLOY_TARGET" = staging ] || { echo "Origin-direct bootstrap is restricted to staging." >&2; exit 1; }
  [ "$PUBLIC_INGRESS_MODE" = domain_hsts ] || { echo "Origin-direct bootstrap requires domain_hsts ingress." >&2; exit 1; }
  : "${ORIGIN_INGRESS_IP:?ORIGIN_INGRESS_IP is required for origin-direct bootstrap}"
fi
case "$APP_DIR" in "~") APP_DIR="$HOME" ;; "~/"*) APP_DIR="$HOME/${APP_DIR#"~/"}" ;; esac
[ -d "$APP_DIR" ] || { echo "Application root does not exist: $APP_DIR" >&2; exit 1; }
APP_DIR="$(cd "$APP_DIR" && pwd -P)"
case "$ENV_FILE" in /*) STABLE_ENV_FILE="$ENV_FILE" ;; *) STABLE_ENV_FILE="$APP_DIR/$ENV_FILE" ;; esac
case "$PEER_RUNTIME_ENV_FILE" in /*) ;; *) echo "PEER_RUNTIME_ENV_FILE must be absolute." >&2; exit 1 ;; esac
case "$COMPOSE_FILE" in /*|../*|*/../*) echo "COMPOSE_FILE must stay inside each release." >&2; exit 1 ;; esac

RELEASES_DIR="$APP_DIR/releases"
FAILED_RELEASES_DIR="$APP_DIR/failed-releases"
CURRENT_LINK="$APP_DIR/current"
CURRENT_NEXT_LINK="$APP_DIR/current.next"
STATE_FILE="$APP_DIR/pending-application-release.env"
STABLE_DATA_DIR="$APP_DIR/deploy/data"
CANDIDATE_DIR=''
RELEASE_DIR="$RELEASES_DIR/$RELEASE_SHA"

mkdir -p "$RELEASES_DIR" "$FAILED_RELEASES_DIR" "$STABLE_DATA_DIR/logs"
exec 9>"$APP_DIR/.deploy.lock"
flock -n 9 || { echo "Another application deployment is active." >&2; exit 3; }
[ -f "$STABLE_ENV_FILE" ] || { echo "Missing production env file: $STABLE_ENV_FILE" >&2; exit 1; }
[ -f "$PEER_RUNTIME_ENV_FILE" ] || { echo "Missing peer runtime env file: $PEER_RUNTIME_ENV_FILE" >&2; exit 1; }
[ "$(readlink -f "$STABLE_ENV_FILE")" != "$(readlink -f "$PEER_RUNTIME_ENV_FILE")" ] || {
  echo "Current and peer runtime env files must differ." >&2
  exit 1
}
[ -f "$RELEASE_ARCHIVE" ] || { echo "Missing release archive: $RELEASE_ARCHIVE" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required on the deployment host." >&2; exit 1; }

read_env_value_from() {
  local env_file="$1" key="$2"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); sub(/\r$/, ""); value = $0 } END { print value }' "$env_file"
}

read_env_value() {
  read_env_value_from "$STABLE_ENV_FILE" "$1"
}

url_origin() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlsplit
url = urlsplit(sys.argv[1])
if not url.scheme or not url.netloc or url.username or url.password:
    raise SystemExit(1)
print(f'{url.scheme}://{url.netloc}')
PY
}

url_project_ref() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlsplit
hostname = urlsplit(sys.argv[1]).hostname or ''
value = hostname.split('.')[0]
if not value:
    raise SystemExit(1)
print(value)
PY
}

validate_runtime_slot() {
  local expected_web_port expected_compose_project_name
  local actual_web_port actual_compose_project_name
  case "$DEPLOY_TARGET" in
    production)
      expected_web_port=8080
      expected_compose_project_name=project-management
      ;;
    staging)
      expected_web_port=8081
      expected_compose_project_name=project-management-staging
      ;;
    *) echo "Unsupported deployment target: $DEPLOY_TARGET" >&2; return 1 ;;
  esac
  actual_web_port="$(read_env_value WEB_PORT)"
  actual_compose_project_name="$(read_env_value COMPOSE_PROJECT_NAME)"
  [ "$actual_web_port" = "$expected_web_port" ] || {
    echo "WEB_PORT does not match the governed deployment slot for $DEPLOY_TARGET." >&2
    return 1
  }
  [ "$actual_compose_project_name" = "$expected_compose_project_name" ] || {
    echo "COMPOSE_PROJECT_NAME does not match the governed deployment slot for $DEPLOY_TARGET." >&2
    return 1
  }
  COMPOSE_PROJECT_NAME_VALUE="$actual_compose_project_name"
}

validate_jwt_secret_fingerprints() {
  local jwt_secret_value="$1" peer_jwt_secret_value="$2"
  local actual_fingerprint peer_actual_fingerprint
  [[ "$EXPECTED_JWT_SECRET_SHA256" =~ ^[0-9a-f]{64}$ ]] || {
    echo "Registered JWT secret fingerprint is missing or invalid." >&2
    return 1
  }
  [[ "$PEER_JWT_SECRET_SHA256" =~ ^[0-9a-f]{64}$ ]] || {
    echo "Peer JWT secret fingerprint is missing or invalid." >&2
    return 1
  }
  [ "$EXPECTED_JWT_SECRET_SHA256" != "$PEER_JWT_SECRET_SHA256" ] || {
    echo "Staging and production JWT secret fingerprints must differ." >&2
    return 1
  }
  actual_fingerprint="$(printf '%s' "$jwt_secret_value" | sha256sum | awk '{print $1}')" || return 1
  peer_actual_fingerprint="$(printf '%s' "$peer_jwt_secret_value" | sha256sum | awk '{print $1}')" || return 1
  [ "$actual_fingerprint" = "$EXPECTED_JWT_SECRET_SHA256" ] || {
    echo "Runtime JWT secret does not match the registered environment fingerprint." >&2
    return 1
  }
  [ "$peer_actual_fingerprint" = "$PEER_JWT_SECRET_SHA256" ] || {
    echo "Peer runtime JWT secret does not match the registered peer fingerprint." >&2
    return 1
  }
  [ "$actual_fingerprint" != "$peer_actual_fingerprint" ] || {
    echo "Current and peer runtime JWT secrets must differ." >&2
    return 1
  }
}

validate_supabase_runtime_key_claim() {
  local runtime_key="$1"
  printf '%s' "$runtime_key" | python3 -c '
import base64
import binascii
import json
import re
import sys
import time

token = sys.stdin.read().strip()
parts = token.split(".")

def decode_segment(segment, label):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", segment) or len(segment) % 4 == 1:
        raise ValueError(f"invalid compact JWT {label}")
    raw = base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))
    if not raw or base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") != segment:
        raise ValueError(f"invalid compact JWT {label}")
    return raw

try:
    if len(parts) != 3 or not all(parts):
        raise ValueError("invalid JWT structure")
    header = json.loads(decode_segment(parts[0], "header").decode("utf-8"))
    payload = json.loads(decode_segment(parts[1], "payload").decode("utf-8"))
    decode_segment(parts[2], "signature")
except (ValueError, UnicodeDecodeError, json.JSONDecodeError, binascii.Error):
    print("SUPABASE_RUNTIME_KEY must use valid compact JWT serialization.", file=sys.stderr)
    raise SystemExit(1)

algorithm = header.get("alg") if isinstance(header, dict) else None
if not isinstance(algorithm, str) or not algorithm.strip() or algorithm.lower() == "none":
    print("SUPABASE_RUNTIME_KEY JWT header must declare a signing algorithm.", file=sys.stderr)
    raise SystemExit(1)
if not isinstance(payload, dict) or payload.get("role") != "workbuddy_runtime":
    print("SUPABASE_RUNTIME_KEY JWT role must be workbuddy_runtime.", file=sys.stderr)
    raise SystemExit(1)
expires_at = payload.get("exp")
if isinstance(expires_at, bool) or not isinstance(expires_at, int) or expires_at <= int(time.time()):
    print("SUPABASE_RUNTIME_KEY JWT is expired or has no valid expiry.", file=sys.stderr)
    raise SystemExit(1)
'
}

validate_runtime_slot

[ -z "$(read_env_value SUPABASE_SERVICE_KEY)" ] || {
  echo "SUPABASE_SERVICE_KEY is forbidden in the API runtime env file." >&2
  exit 1
}
supabase_anon_key="$(read_env_value SUPABASE_ANON_KEY)"
[ -n "$supabase_anon_key" ] || {
  echo "SUPABASE_ANON_KEY is required as the registered Supabase gateway apikey." >&2
  exit 1
}
supabase_runtime_key="$(read_env_value SUPABASE_RUNTIME_KEY)"
[ -n "$supabase_runtime_key" ] || {
  echo "SUPABASE_RUNTIME_KEY is required and must represent a non-BYPASSRLS application role." >&2
  exit 1
}
[ "$supabase_anon_key" != "$supabase_runtime_key" ] || {
  echo "SUPABASE_ANON_KEY and SUPABASE_RUNTIME_KEY must be distinct credentials." >&2
  exit 1
}
validate_supabase_runtime_key_claim "$supabase_runtime_key"
unset supabase_anon_key supabase_runtime_key

case "$DEPLOY_TARGET" in
  production)
    expected_auth_cookie_name="workbuddy_production_auth_token"
    expected_jwt_issuer="workbuddy-production"
    expected_jwt_audience="workbuddy-production-api"
    ;;
  staging)
    expected_auth_cookie_name="workbuddy_staging_auth_token"
    expected_jwt_issuer="workbuddy-staging"
    expected_jwt_audience="workbuddy-staging-api"
    ;;
  *) echo "Unsupported deployment target: $DEPLOY_TARGET" >&2; exit 1 ;;
esac

auth_cookie_name="$(read_env_value AUTH_COOKIE_NAME)"
jwt_issuer="$(read_env_value JWT_ISSUER)"
jwt_audience="$(read_env_value JWT_AUDIENCE)"
jwt_secret="$(read_env_value JWT_SECRET)"
peer_jwt_secret="$(read_env_value_from "$PEER_RUNTIME_ENV_FILE" JWT_SECRET)"
public_https_origin="$(read_env_value PUBLIC_HTTPS_ORIGIN)"
runtime_public_ingress_mode="$(read_env_value PUBLIC_INGRESS_MODE)"
cors_origin="$(read_env_value CORS_ORIGIN)"
expected_public_origin="$(url_origin "$HEALTH_URL")"
[ "$auth_cookie_name" = "$expected_auth_cookie_name" ] || { echo "AUTH_COOKIE_NAME does not match DEPLOY_TARGET." >&2; exit 1; }
[ "$jwt_issuer" = "$expected_jwt_issuer" ] || { echo "JWT_ISSUER does not match DEPLOY_TARGET." >&2; exit 1; }
[ "$jwt_audience" = "$expected_jwt_audience" ] || { echo "JWT_AUDIENCE does not match DEPLOY_TARGET." >&2; exit 1; }
[ "${#jwt_secret}" -ge 32 ] || { echo "JWT_SECRET must contain at least 32 characters and must be environment-specific." >&2; exit 1; }
[ "${#peer_jwt_secret}" -ge 32 ] || { echo "Peer JWT_SECRET must contain at least 32 characters." >&2; exit 1; }
validate_jwt_secret_fingerprints "$jwt_secret" "$peer_jwt_secret"
[ "$public_https_origin" = "$expected_public_origin" ] || { echo "PUBLIC_HTTPS_ORIGIN must exactly match the deployment health origin." >&2; exit 1; }
[ "$runtime_public_ingress_mode" = "$PUBLIC_INGRESS_MODE" ] || { echo "PUBLIC_INGRESS_MODE in the runtime env must match the deployment contract." >&2; exit 1; }
[ "$cors_origin" = "$expected_public_origin" ] || { echo "CORS_ORIGIN must contain only the current deployment origin." >&2; exit 1; }

WEB_PORT_VALUE="$(read_env_value WEB_PORT)"
WEB_PORT_VALUE="${WEB_PORT_VALUE:-8080}"
INTERNAL_HEALTH_URL="http://127.0.0.1:${WEB_PORT_VALUE}/api/readyz"
VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-$(read_env_value VITE_SUPABASE_URL)}"
VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-$(read_env_value SUPABASE_URL)}"
VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-$(read_env_value VITE_SUPABASE_ANON_KEY)}"
VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-$(read_env_value SUPABASE_ANON_KEY)}"
: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL or SUPABASE_URL is required in $STABLE_ENV_FILE}"
: "${VITE_SUPABASE_ANON_KEY:?VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY is required in $STABLE_ENV_FILE}"
export VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY
expected_public_project_ref="$(url_project_ref "$(read_env_value SUPABASE_URL)")"

if docker info >/dev/null 2>&1; then
  USE_SUDO_DOCKER=0
elif sudo -n docker info >/dev/null 2>&1; then
  USE_SUDO_DOCKER=1
else
  echo "Docker is not available for the deploy user." >&2
  exit 1
fi

retry() {
  local max_attempts="$1" delay_seconds="$2"
  shift 2
  local attempt=1
  until "$@"; do
    [ "$attempt" -lt "$max_attempts" ] || return 1
    echo "Command failed, retrying in ${delay_seconds}s (${attempt}/${max_attempts})..." >&2
    sleep "$delay_seconds"
    attempt=$((attempt + 1))
  done
}

atomic_link() {
  local target="$1"
  ln -sfn "$target" "$CURRENT_NEXT_LINK" || return 1
  mv -Tf "$CURRENT_NEXT_LINK" "$CURRENT_LINK" || return 1
}

prepare_runtime_links() {
  local release_dir="$1"
  mkdir -p "$release_dir/deploy/env" || return 1
  rm -f "$release_dir/deploy/env/server.production.env" || return 1
  ln -sfn "$STABLE_ENV_FILE" "$release_dir/deploy/env/server.production.env" || return 1
  rm -rf "$release_dir/deploy/data" || return 1
  ln -sfn "$STABLE_DATA_DIR" "$release_dir/deploy/data" || return 1
}

release_sha_from_manifest() {
  python3 - "$1/client/dist/workbuddy-build.json" <<'PY'
import json
import re
import sys
with open(sys.argv[1], encoding='utf-8') as handle:
    value = json.load(handle).get('releaseSha', '')
if not re.fullmatch(r'[0-9a-f]{40}', value):
    raise SystemExit(1)
print(value, end='')
PY
}

server_release_sha_from_manifest() {
  python3 - "$1/server/dist/workbuddy-server-build.json" <<'PY'
import json
import re
import sys
with open(sys.argv[1], encoding='utf-8') as handle:
    value = json.load(handle).get('releaseSha', '')
if not re.fullmatch(r'[0-9a-f]{40}', value):
    raise SystemExit(1)
print(value, end='')
PY
}

set_release_contract() {
  local release_dir="$1" expected_sha="$2" server_contract_mode="${3:-require_prebuilt}"
  local actual_sha server_sha require_server_artifact=false
  [ -f "$release_dir/$COMPOSE_FILE" ] || { echo "Release Compose file is missing." >&2; return 1; }
  [ -f "$release_dir/deploy/env/server.production.env" ] || { echo "Release runtime env link is missing." >&2; return 1; }
  [ -f "$release_dir/scripts/classify-public-ingress-url.mjs" ] || { echo "Release ingress classifier is missing." >&2; return 1; }
  [ -f "$release_dir/client/dist/workbuddy-build.json" ] || { echo "Release frontend build provenance is missing." >&2; return 1; }
  actual_sha="$(release_sha_from_manifest "$release_dir")" || return 1
  [ "$actual_sha" = "$expected_sha" ] || { echo "Frontend build provenance does not match release SHA $expected_sha." >&2; return 1; }
  case "$server_contract_mode" in
    require_prebuilt) require_server_artifact=true ;;
    allow_legacy_source)
      if [ -e "$release_dir/server/dist/index.js" ] || [ -e "$release_dir/server/dist/workbuddy-server-build.json" ]; then
        require_server_artifact=true
      fi
      ;;
    *) echo "Unknown server release contract mode: $server_contract_mode" >&2; return 1 ;;
  esac
  if [ "$require_server_artifact" = true ]; then
    [ -f "$release_dir/server/dist/index.js" ] || { echo "Prebuilt server entrypoint is missing." >&2; return 1; }
    server_sha="$(server_release_sha_from_manifest "$release_dir")" || return 1
    [ "$server_sha" = "$expected_sha" ] || { echo "Server build provenance does not match release SHA $expected_sha." >&2; return 1; }
  fi
  ACTIVE_RELEASE_DIR="$release_dir"
  ACTIVE_RELEASE_SHA="$expected_sha"
  LATEST_SCHEMA_MIGRATION_PATH="$(find "$release_dir/server/migrations" -maxdepth 1 -type f -name '[0-9]*_*.sql' -print | sort -V | tail -n 1)"
  [ -n "$LATEST_SCHEMA_MIGRATION_PATH" ] && [ -f "$LATEST_SCHEMA_MIGRATION_PATH" ] || { echo "No managed schema migration found." >&2; return 1; }
  EXPECTED_SCHEMA_MIGRATION_FILENAME="$(basename "$LATEST_SCHEMA_MIGRATION_PATH")"
  EXPECTED_SCHEMA_MIGRATION_CHECKSUM="$(sha256sum "$LATEST_SCHEMA_MIGRATION_PATH" | awk '{print $1}')"
  [ -n "$EXPECTED_SCHEMA_MIGRATION_CHECKSUM" ] || return 1
}

run_docker_compose() {
  local release_dir="$1" release_sha="$2" migration_filename="$3" migration_checksum="$4"
  shift 4
  if [ "$USE_SUDO_DOCKER" = 1 ]; then
    sudo -n env RELEASE_SHA="$release_sha" DEPLOY_TARGET="$DEPLOY_TARGET" \
      EXPECTED_SCHEMA_MIGRATION_FILENAME="$migration_filename" EXPECTED_SCHEMA_MIGRATION_CHECKSUM="$migration_checksum" \
      VITE_SUPABASE_URL="$VITE_SUPABASE_URL" VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
      docker compose --env-file "$STABLE_ENV_FILE" -f "$release_dir/$COMPOSE_FILE" "$@"
  else
    env RELEASE_SHA="$release_sha" DEPLOY_TARGET="$DEPLOY_TARGET" \
      EXPECTED_SCHEMA_MIGRATION_FILENAME="$migration_filename" EXPECTED_SCHEMA_MIGRATION_CHECKSUM="$migration_checksum" \
      VITE_SUPABASE_URL="$VITE_SUPABASE_URL" VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
      docker compose --env-file "$STABLE_ENV_FILE" -f "$release_dir/$COMPOSE_FILE" "$@"
  fi
}

run_docker_command() {
  if [ "$USE_SUDO_DOCKER" = 1 ]; then
    sudo -n docker "$@"
  else
    docker "$@"
  fi
}

container_inspect_value() {
  run_docker_command container inspect "$1" --format "$2" 2>/dev/null
}

container_env_value() {
  local container="$1" key="$2"
  run_docker_command container inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); value = $0 } END { print value }'
}

container_health() {
  container_inspect_value "$1" '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}'
}

verify_runtime_container_identities() {
  local expected_sha="$1" service container release_sha target status health
  for service in web api worker; do
    container="${COMPOSE_PROJECT_NAME_VALUE}-${service}"
    [ "$(container_inspect_value "$container" '{{index .Config.Labels "com.docker.compose.service"}}')" = "$service" ] || return 1
    status="$(container_inspect_value "$container" '{{.State.Status}}')"
    [ "$status" = running ] || return 1
    release_sha="$(container_env_value "$container" RELEASE_SHA)"
    target="$(container_env_value "$container" DEPLOY_TARGET)"
    if [ "$service" = web ] && { [ -z "$release_sha" ] || [ -z "$target" ]; }; then
      # Pre-atomic releases prove Web identity through the immutable served build manifest.
      :
    else
      [ "$release_sha" = "$expected_sha" ] || return 1
      [ "$target" = "$DEPLOY_TARGET" ] || return 1
    fi
    health="$(container_health "$container")"
    if [ "$service" = web ]; then
      case "$health" in healthy|missing) ;; *) return 1 ;; esac
    else
      [ "$health" = healthy ] || return 1
    fi
  done
}

run_docker_builder_prune() {
  if [ "$USE_SUDO_DOCKER" = 1 ]; then sudo -n docker builder prune -af; else docker builder prune -af; fi
}

run_api_build_with_cache_repair() {
  local release_dir="$1" release_sha="$2" migration_filename="$3" migration_checksum="$4"
  local build_log="/tmp/project-management-build-api-${release_sha}.log"
  if run_docker_compose "$release_dir" "$release_sha" "$migration_filename" "$migration_checksum" build api 2>&1 | tee "$build_log"; then return 0; fi
  if grep -Eq 'failed to prepare extraction snapshot|parent snapshot .* does not exist' "$build_log"; then
    run_docker_builder_prune || return 1
    run_docker_compose "$release_dir" "$release_sha" "$migration_filename" "$migration_checksum" build api
    return $?
  fi
  return 1
}

build_and_up_release() {
  local release_dir="$1" release_sha="$2" server_contract_mode="${3:-require_prebuilt}"
  local migration_filename migration_checksum
  set_release_contract "$release_dir" "$release_sha" "$server_contract_mode" || return 1
  migration_filename="$EXPECTED_SCHEMA_MIGRATION_FILENAME"
  migration_checksum="$EXPECTED_SCHEMA_MIGRATION_CHECKSUM"
  run_api_build_with_cache_repair "$release_dir" "$release_sha" "$migration_filename" "$migration_checksum" || return 1
  run_docker_compose "$release_dir" "$release_sha" "$migration_filename" "$migration_checksum" up -d --build --remove-orphans || return 1
  run_docker_compose "$release_dir" "$release_sha" "$migration_filename" "$migration_checksum" ps || return 1
}

verify_readyz_identity() {
  RELEASE_SHA_TO_VERIFY="$2" DEPLOY_TARGET_TO_VERIFY="$DEPLOY_TARGET" EXPECTED_PROJECT_REF_TO_VERIFY="$expected_public_project_ref" \
    python3 - "$1" <<'PY'
import json
import os
import sys
with open(sys.argv[1], encoding='utf-8') as handle:
    readiness = json.load(handle)
build = readiness.get('build') or {}
if (readiness.get('status') != 'ready'
        or build.get('releaseSha') != os.environ['RELEASE_SHA_TO_VERIFY']
        or build.get('deployTarget') != os.environ['DEPLOY_TARGET_TO_VERIFY']
        or build.get('supabaseProjectRef') != os.environ['EXPECTED_PROJECT_REF_TO_VERIFY']
        or build.get('databaseProjectRef') != os.environ['EXPECTED_PROJECT_REF_TO_VERIFY']):
    raise SystemExit(1)
PY
}

verify_web_build_identity() {
  RELEASE_SHA_TO_VERIFY="$2" python3 - "$1" <<'PY'
import json
import os
import sys
with open(sys.argv[1], encoding='utf-8') as handle:
    build = json.load(handle)
if build.get('releaseSha') != os.environ['RELEASE_SHA_TO_VERIFY']:
    raise SystemExit(1)
PY
}

curl_ingress_route() {
  local route="$1" url="$2"
  shift 2
  if [ "$route" != origin ]; then
    curl "$@" "$url"
    return
  fi
  : "${ORIGIN_INGRESS_IP:?ORIGIN_INGRESS_IP is required for an origin probe}"
  case "$url" in
    "http://$EXPECTED_PUBLIC_HOST"*)
      curl --resolve "$EXPECTED_PUBLIC_HOST:80:$ORIGIN_INGRESS_IP" "$@" "$url"
      ;;
    "https://$EXPECTED_PUBLIC_HOST"*)
      curl --resolve "$EXPECTED_PUBLIC_HOST:443:$ORIGIN_INGRESS_IP" "$@" "$url"
      ;;
    *)
      echo "Origin probe URL does not match EXPECTED_PUBLIC_HOST." >&2
      return 1
      ;;
  esac
}

verify_external_ingress_route() {
  local route="$1" expected_sha="$2" public_file="$3"
  local headers_file="${public_file}.headers"
  local redirect_result redirect_status redirect_url
  curl_ingress_route "$route" "$HEALTH_URL" --fail --silent --show-error \
    --dump-header "$headers_file" -o "$public_file" || return 1
  verify_readyz_identity "$public_file" "$expected_sha" || return 1
  if ! tr -d '\r' < "$headers_file" | grep -qi '^strict-transport-security:'; then
    if [ "$PUBLIC_INGRESS_MODE" = domain_hsts ]; then
      echo "$route HTTPS response is missing Strict-Transport-Security." >&2
      return 1
    fi
  fi
  redirect_result="$(curl_ingress_route "$route" "$HTTP_REDIRECT_URL" \
    --silent --show-error --max-time 15 --max-redirs 0 --output /dev/null \
    --write-out '%{http_code} %{redirect_url}')" || return 1
  redirect_status="${redirect_result%% *}"
  redirect_url="${redirect_result#* }"
  [ "$redirect_status" = 308 ] || {
    echo "$route HTTP endpoint did not return the required exact 308 redirect." >&2
    return 1
  }
  [ "$redirect_url" = "$HEALTH_URL" ] || {
    echo "$route HTTP endpoint did not redirect to the HTTPS health authority." >&2
    return 1
  }
}

validate_public_ingress_contract() {
  python3 - "$HEALTH_URL" "$HTTP_REDIRECT_URL" "$DEPLOY_TARGET" "$EXPECTED_PUBLIC_HOST" "$PUBLIC_INGRESS_MODE" <<'PY'
import ipaddress
import re
import sys
from urllib.parse import urlsplit

def normalized_expected_host(value):
    normalized = value.strip().lower()
    if normalized.startswith('[') and normalized.endswith(']'):
        normalized = normalized[1:-1]
    return normalized[:-1] if normalized.endswith('.') else normalized

def is_globally_routable_ipv4(address):
    if not isinstance(address, ipaddress.IPv4Address):
        return False
    a, b, c, _d = (int(part) for part in str(address).split('.'))
    if a in {0, 10, 127} or a >= 224:
        return False
    if a == 100 and 64 <= b <= 127:
        return False
    if a == 169 and b == 254:
        return False
    if a == 172 and 16 <= b <= 31:
        return False
    if a == 192 and b == 168:
        return False
    if a == 192 and b == 0 and c in {0, 2}:
        return False
    if a == 192 and b == 88 and c == 99:
        return False
    if a == 198 and b in {18, 19}:
        return False
    if a == 198 and b == 51 and c == 100:
        return False
    if a == 203 and b == 0 and c == 113:
        return False
    return True

def is_public_dns_hostname(hostname):
    if len(hostname) > 253:
        return False
    normalized = hostname.lower().removesuffix('.')
    special_use_suffixes = {
        'internal', 'local', 'localhost', 'onion', 'test', 'invalid',
        'example', 'home.arpa',
    }
    if any(normalized == suffix or normalized.endswith(f'.{suffix}') for suffix in special_use_suffixes):
        return False
    labels = normalized.split('.')
    if len(labels) < 2:
        return False
    return all(
        0 < len(label) <= 63
        and re.fullmatch(r'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?', label)
        for label in labels
    )

health = urlsplit(sys.argv[1])
redirect = urlsplit(sys.argv[2])
environment, expected_host, mode = sys.argv[3:6]
if environment not in {'production', 'staging'} or mode not in {'domain_hsts', 'temporary_ip_tls'}:
    raise SystemExit(1)
if health.scheme != 'https' or health.username or health.password or health.query or health.fragment:
    raise SystemExit(1)
health_host = (health.hostname or '').lower()
if health_host != normalized_expected_host(expected_host) or health.path != '/api/readyz':
    raise SystemExit(1)
try:
    address = ipaddress.ip_address(health_host)
except ValueError:
    address = None
if mode == 'domain_hsts':
    if address is not None or not is_public_dns_hostname(health_host) or (health.port or 443) != 443:
        raise SystemExit(1)
else:
    if not is_globally_routable_ipv4(address):
        raise SystemExit(1)
    expected_port = 8443 if environment == 'staging' else 443
    if (health.port or 443) != expected_port:
        raise SystemExit(1)
expected_redirect_path = '/staging-redirect/api/readyz' if mode == 'temporary_ip_tls' and environment == 'staging' else '/api/readyz'
if (redirect.scheme != 'http' or redirect.username or redirect.password or redirect.query or redirect.fragment
        or (redirect.hostname or '').lower() != health_host
        or redirect.path != expected_redirect_path or (redirect.port or 80) != 80):
    raise SystemExit(1)
PY
}

verify_release_health() {
  local expected_sha="$1" internal_file public_file origin_file web_build_file
  local origin_ingress_ready=false public_domain_ready=false
  internal_file="/tmp/project-management-health-${expected_sha}.json"
  public_file="/tmp/project-management-public-health-${expected_sha}.json"
  origin_file="/tmp/project-management-origin-health-${expected_sha}.json"
  web_build_file="/tmp/project-management-web-build-${expected_sha}.json"
  # The web healthcheck has a 20s start period, 30s interval, and three retries.
  retry 31 5 verify_runtime_container_identities "$expected_sha" || return 1
  validate_public_ingress_contract || return 1
  retry 12 5 curl --fail --silent --show-error "$INTERNAL_HEALTH_URL" -o "$internal_file" || return 1
  verify_readyz_identity "$internal_file" "$expected_sha" || return 1
  curl --fail --silent --show-error "http://127.0.0.1:${WEB_PORT_VALUE}/workbuddy-build.json" -o "$web_build_file" || return 1
  verify_web_build_identity "$web_build_file" "$expected_sha" || return 1
  if [ "$PUBLIC_INGRESS_MODE" = domain_hsts ]; then
    verify_external_ingress_route origin "$expected_sha" "$origin_file" || return 1
    origin_ingress_ready=true
  fi
  if verify_external_ingress_route public "$expected_sha" "$public_file"; then
    public_domain_ready=true
  elif [ "$INITIAL_RUNTIME_BOOTSTRAP" = true ] \
    && [ "$DEPLOY_TARGET" = staging ] \
    && [ "$origin_ingress_ready" = true ]; then
    public_domain_ready=false
  else
    echo "Public-domain postdeploy verification failed and origin fallback is not authorized." >&2
    return 1
  fi
  if [ "$PUBLIC_INGRESS_MODE" = temporary_ip_tls ]; then
    printf '{"transportTlsReady":true,"temporaryIngressReady":true,"hstsUserAgentPolicyApplicable":false,"domainHstsReady":false,"originIngressReady":%s,"publicDomainReady":%s}\n' \
      "$origin_ingress_ready" "$public_domain_ready"
  else
    printf '{"transportTlsReady":true,"temporaryIngressReady":false,"hstsHeaderPresent":true,"hstsUserAgentPolicyApplicable":%s,"domainHstsReady":%s,"originIngressReady":true,"publicDomainReady":%s}\n' \
      "$public_domain_ready" "$public_domain_ready" "$public_domain_ready"
  fi
}

print_runtime_failure_diagnostics() {
  local service container
  echo "=== Runtime failure diagnostics (release ${RELEASE_SHA}) ===" >&2
  run_docker_command ps -a \
    --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME_VALUE}" \
    --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' >&2 || true
  for service in web api worker; do
    container="${COMPOSE_PROJECT_NAME_VALUE}-${service}"
    echo "--- ${service}: state and health ---" >&2
    run_docker_command container inspect "$container" \
      --format '{{json .State}}' >&2 || true
    echo "--- ${service}: readiness response ---" >&2
    if [ "$service" = web ]; then
      run_docker_command exec "$container" wget --quiet --output-document=- \
        http://127.0.0.1/api/readyz >&2 || true
    else
      run_docker_command exec "$container" node -e \
        "fetch('http://127.0.0.1:3001/api/readyz').then(async r=>{console.log(JSON.stringify({status:r.status,body:await r.text()}))}).catch(error=>{console.log(JSON.stringify({error:String(error)}));process.exitCode=1})" \
        >&2 || true
    fi
    echo "--- ${service}: recent logs ---" >&2
    run_docker_command logs --timestamps --tail 200 "$container" >&2 || true
  done
}

validate_release_archive() {
  tar -tzf "$1" | awk '{ name=$0; sub(/^\.\//, "", name); if (name ~ /^\// || name ~ /(^|\/)\.\.($|\/)/ || name == "deploy/env/server.production.env") exit 1 }'
}

resolve_current_release_target() {
  if [ ! -e "$CURRENT_LINK" ] && [ ! -L "$CURRENT_LINK" ]; then
    return 0
  fi
  readlink -f "$CURRENT_LINK"
}

quarantine_release_dir() {
  local release_dir="$1" release_sha="$2" current_target
  [ -d "$release_dir" ] || return 0
  current_target="$(resolve_current_release_target)" || return 1
  [ "$current_target" != "$release_dir" ] || return 1
  mkdir -p "$FAILED_RELEASES_DIR" || return 1
  mv "$release_dir" "$FAILED_RELEASES_DIR/${release_sha}-$(date -u +%Y%m%dT%H%M%SZ)-$$" || return 1
}

state_value() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$STATE_FILE"
}

write_activation_state() {
  local activated_target="$1" previous_target="$2"
  local state_candidate="${STATE_FILE}.next.$$"
  rm -f "$state_candidate" || return 1
  if ! {
    printf 'ACTIVATED_SHA=%s\n' "$RELEASE_SHA"
    printf 'ACTIVATED_TARGET=%s\n' "$activated_target"
    printf 'PREVIOUS_TARGET=%s\n' "$previous_target"
  } > "$state_candidate"; then
    rm -f "$state_candidate"
    return 1
  fi
  if ! chmod 600 "$state_candidate"; then
    rm -f "$state_candidate"
    return 1
  fi
  if ! mv -f "$state_candidate" "$STATE_FILE"; then
    rm -f "$state_candidate"
    return 1
  fi
}

rollback_application_release() {
  local activated_sha activated_target previous_target current_target previous_sha
  [ -f "$STATE_FILE" ] || return 0
  activated_sha="$(state_value ACTIVATED_SHA)"
  activated_target="$(state_value ACTIVATED_TARGET)"
  previous_target="$(state_value PREVIOUS_TARGET)"
  require_sha "$activated_sha" || return 1
  [ "$activated_target" = "$RELEASES_DIR/$activated_sha" ] || return 1
  current_target="$(resolve_current_release_target)" || return 1
  if [ -n "$previous_target" ]; then
    case "$previous_target" in "$RELEASES_DIR"/*) ;; *) return 1 ;; esac
    [ -d "$previous_target" ] || return 1
    case "$current_target" in "$activated_target"|"$previous_target") ;; *) return 1 ;; esac
    previous_sha="$(release_sha_from_manifest "$previous_target")" || return 1
    build_and_up_release "$previous_target" "$previous_sha" allow_legacy_source || return 1
    verify_release_health "$previous_sha" || {
      echo "Previous release is not compatible with the migrated schema; rollback remains pending." >&2
      return 1
    }
    atomic_link "$previous_target" || return 1
  else
    case "$current_target" in "$activated_target"|'') ;; *) return 1 ;; esac
    set_release_contract "$activated_target" "$activated_sha" || return 1
    run_docker_compose "$activated_target" "$activated_sha" "$EXPECTED_SCHEMA_MIGRATION_FILENAME" "$EXPECTED_SCHEMA_MIGRATION_CHECKSUM" down || return 1
    rm -f "$CURRENT_LINK" || return 1
  fi
  quarantine_release_dir "$activated_target" "$activated_sha" || return 1
  rm -f "$STATE_FILE" || return 1
  printf '%s\n' '{"status":"rolled_back","previousReleaseVerified":true,"databaseMutation":false}'
}

snapshot_legacy_release() {
  local snapshot_dir snapshot_candidate previous_sha timestamp
  [ -f "$APP_DIR/client/dist/workbuddy-build.json" ] || return 1
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  snapshot_dir="$RELEASES_DIR/legacy-$timestamp-$$"
  snapshot_candidate="$RELEASES_DIR/.legacy-candidate-$timestamp-$$"
  mkdir -p "$snapshot_candidate" || return 1
  if ! tar -C "$APP_DIR" --exclude='./releases' --exclude='./failed-releases' --exclude='./current' \
    --exclude='./pending-application-release.env' --exclude='./.deploy.lock' --exclude='./.git' \
    --exclude='./deploy/env/server.production.env' --exclude='./deploy/data' --exclude='./deploy/backups' \
    -cf - . | tar -xf - -C "$snapshot_candidate"; then
    rm -rf "$snapshot_candidate"
    return 1
  fi
  prepare_runtime_links "$snapshot_candidate" || { rm -rf "$snapshot_candidate"; return 1; }
  previous_sha="$(release_sha_from_manifest "$snapshot_candidate")" || { rm -rf "$snapshot_candidate"; return 1; }
  set_release_contract "$snapshot_candidate" "$previous_sha" allow_legacy_source || { rm -rf "$snapshot_candidate"; return 1; }
  mv "$snapshot_candidate" "$snapshot_dir" || return 1
  atomic_link "$snapshot_dir" || return 1
  printf '%s' "$snapshot_dir"
}

deployment_failure() {
  local exit_code=$? rollback_status=0
  trap - ERR INT TERM
  set +e
  print_runtime_failure_diagnostics || true
  [ -z "$CANDIDATE_DIR" ] || rm -rf "$CANDIDATE_DIR"
  if [ -f "$STATE_FILE" ]; then
    rollback_application_release
    rollback_status=$?
  else
    quarantine_release_dir "$RELEASE_DIR" "$RELEASE_SHA"
    rollback_status=$?
  fi
  [ "$rollback_status" -eq 0 ] || echo "Application rollback did not complete; pending state was preserved." >&2
  exit "$exit_code"
}
trap deployment_failure ERR INT TERM

if [ -f "$STATE_FILE" ]; then rollback_application_release || exit 1; fi
PREVIOUS_TARGET="$(resolve_current_release_target)" || {
  echo "Current application pointer could not be resolved." >&2
  exit 1
}
if [ -z "$PREVIOUS_TARGET" ]; then
  if [ -f "$APP_DIR/client/dist/workbuddy-build.json" ]; then
    PREVIOUS_TARGET="$(snapshot_legacy_release)" || { echo "Existing tree could not be captured as a rollback release." >&2; exit 1; }
  elif [ "$INITIAL_RUNTIME_BOOTSTRAP" != true ]; then
    echo "No rollback-capable previous release exists; explicit initial bootstrap is required." >&2
    exit 1
  fi
elif [[ "$PREVIOUS_TARGET" != "$RELEASES_DIR/"* ]] || [ ! -d "$PREVIOUS_TARGET" ]; then
  echo "Current application pointer is outside the managed releases directory." >&2
  exit 1
fi

if [ -d "$RELEASE_DIR" ] && [ "$PREVIOUS_TARGET" = "$RELEASE_DIR" ]; then
  set_release_contract "$RELEASE_DIR" "$RELEASE_SHA"
  verify_release_health "$RELEASE_SHA"
  rm -f "$RELEASE_ARCHIVE"
  trap - ERR INT TERM
  printf '%s\n' '{"status":"already_deployed","releaseMutation":false}'
  exit 0
fi
if [ -e "$RELEASE_DIR" ]; then quarantine_release_dir "$RELEASE_DIR" "$RELEASE_SHA" || exit 1; fi

CANDIDATE_DIR="$RELEASES_DIR/.candidate-$RELEASE_SHA-$$"
mkdir -p "$CANDIDATE_DIR"
validate_release_archive "$RELEASE_ARCHIVE"
tar -xzf "$RELEASE_ARCHIVE" -C "$CANDIDATE_DIR"
prepare_runtime_links "$CANDIDATE_DIR"
set_release_contract "$CANDIDATE_DIR" "$RELEASE_SHA" require_prebuilt
mv "$CANDIDATE_DIR" "$RELEASE_DIR"
CANDIDATE_DIR=''
rm -f "$RELEASE_ARCHIVE"

set_release_contract "$RELEASE_DIR" "$RELEASE_SHA"
run_api_build_with_cache_repair "$RELEASE_DIR" "$RELEASE_SHA" "$EXPECTED_SCHEMA_MIGRATION_FILENAME" "$EXPECTED_SCHEMA_MIGRATION_CHECKSUM"
write_activation_state "$RELEASE_DIR" "$PREVIOUS_TARGET"
run_docker_compose "$RELEASE_DIR" "$RELEASE_SHA" "$EXPECTED_SCHEMA_MIGRATION_FILENAME" "$EXPECTED_SCHEMA_MIGRATION_CHECKSUM" up -d --build --remove-orphans
run_docker_compose "$RELEASE_DIR" "$RELEASE_SHA" "$EXPECTED_SCHEMA_MIGRATION_FILENAME" "$EXPECTED_SCHEMA_MIGRATION_CHECKSUM" ps
verify_release_health "$RELEASE_SHA"
atomic_link "$RELEASE_DIR"
rm -f "$STATE_FILE"
trap - ERR INT TERM
printf '{"status":"deployed","releaseSha":"%s","previousReleasePreserved":%s,"databaseMutation":false}\n' \
  "$RELEASE_SHA" "$([ -n "$PREVIOUS_TARGET" ] && printf true || printf false)"
