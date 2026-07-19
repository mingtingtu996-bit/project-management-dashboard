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
PERFORMANCE_SUMMARY_URL="${PERFORMANCE_SUMMARY_URL:-}"
INITIAL_RUNTIME_BOOTSTRAP="${INITIAL_RUNTIME_BOOTSTRAP:-false}"
EXPECTED_JWT_SECRET_SHA256="${EXPECTED_JWT_SECRET_SHA256:-}"
PEER_JWT_SECRET_SHA256="${PEER_JWT_SECRET_SHA256:-}"

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
case "$HEALTH_URL" in https://*) ;; *) echo "External deployment health URL must use https://." >&2; exit 1 ;; esac
case "$HTTP_REDIRECT_URL" in http://*) ;; *) echo "External deployment redirect URL must use http://." >&2; exit 1 ;; esac
case "$PUBLIC_INGRESS_MODE" in domain_hsts|temporary_ip_tls) ;; *) echo "Unsupported PUBLIC_INGRESS_MODE." >&2; exit 1 ;; esac
case "$INITIAL_RUNTIME_BOOTSTRAP" in true|false) ;; *) echo "INITIAL_RUNTIME_BOOTSTRAP must be true or false." >&2; exit 1 ;; esac
case "$APP_DIR" in "~") APP_DIR="$HOME" ;; "~/"*) APP_DIR="$HOME/${APP_DIR#"~/"}" ;; esac
[ -d "$APP_DIR" ] || { echo "Application root does not exist: $APP_DIR" >&2; exit 1; }
APP_DIR="$(cd "$APP_DIR" && pwd -P)"
case "$ENV_FILE" in /*) STABLE_ENV_FILE="$ENV_FILE" ;; *) STABLE_ENV_FILE="$APP_DIR/$ENV_FILE" ;; esac
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
[ -f "$RELEASE_ARCHIVE" ] || { echo "Missing release archive: $RELEASE_ARCHIVE" >&2; exit 1; }

read_env_value() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); sub(/\r$/, ""); value = $0 } END { print value }' "$STABLE_ENV_FILE"
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
}

validate_jwt_secret_fingerprint() {
  local jwt_secret_value="$1" actual_fingerprint
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
  [ "$actual_fingerprint" = "$EXPECTED_JWT_SECRET_SHA256" ] || {
    echo "Runtime JWT secret does not match the registered environment fingerprint." >&2
    return 1
  }
}

validate_runtime_slot

[ -z "$(read_env_value SUPABASE_SERVICE_KEY)" ] || {
  echo "SUPABASE_SERVICE_KEY is forbidden in the API runtime env file." >&2
  exit 1
}
[ -n "$(read_env_value SUPABASE_RUNTIME_KEY)" ] || {
  echo "SUPABASE_RUNTIME_KEY is required and must represent a non-BYPASSRLS application role." >&2
  exit 1
}

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
public_https_origin="$(read_env_value PUBLIC_HTTPS_ORIGIN)"
runtime_public_ingress_mode="$(read_env_value PUBLIC_INGRESS_MODE)"
cors_origin="$(read_env_value CORS_ORIGIN)"
expected_public_origin="$(node -e "process.stdout.write(new URL(process.argv[1]).origin)" "$HEALTH_URL")"
[ "$auth_cookie_name" = "$expected_auth_cookie_name" ] || { echo "AUTH_COOKIE_NAME does not match DEPLOY_TARGET." >&2; exit 1; }
[ "$jwt_issuer" = "$expected_jwt_issuer" ] || { echo "JWT_ISSUER does not match DEPLOY_TARGET." >&2; exit 1; }
[ "$jwt_audience" = "$expected_jwt_audience" ] || { echo "JWT_AUDIENCE does not match DEPLOY_TARGET." >&2; exit 1; }
[ "${#jwt_secret}" -ge 32 ] || { echo "JWT_SECRET must contain at least 32 characters and must be environment-specific." >&2; exit 1; }
validate_jwt_secret_fingerprint "$jwt_secret"
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
expected_public_project_ref="$(node -e "process.stdout.write(new URL(process.argv[1]).hostname.split('.')[0])" "$(read_env_value SUPABASE_URL)")"

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
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).releaseSha;
    if (!/^[0-9a-f]{40}$/.test(value ?? "")) process.exit(1);
    process.stdout.write(value);
  ' "$1/client/dist/workbuddy-build.json"
}

set_release_contract() {
  local release_dir="$1" expected_sha="$2" actual_sha
  [ -f "$release_dir/$COMPOSE_FILE" ] || { echo "Release Compose file is missing." >&2; return 1; }
  [ -f "$release_dir/deploy/env/server.production.env" ] || { echo "Release runtime env link is missing." >&2; return 1; }
  [ -f "$release_dir/scripts/classify-public-ingress-url.mjs" ] || { echo "Release ingress classifier is missing." >&2; return 1; }
  [ -f "$release_dir/client/dist/workbuddy-build.json" ] || { echo "Release frontend build provenance is missing." >&2; return 1; }
  actual_sha="$(release_sha_from_manifest "$release_dir")" || return 1
  [ "$actual_sha" = "$expected_sha" ] || { echo "Frontend build provenance does not match release SHA $expected_sha." >&2; return 1; }
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
  local release_dir="$1" release_sha="$2" migration_filename migration_checksum
  set_release_contract "$release_dir" "$release_sha" || return 1
  migration_filename="$EXPECTED_SCHEMA_MIGRATION_FILENAME"
  migration_checksum="$EXPECTED_SCHEMA_MIGRATION_CHECKSUM"
  run_api_build_with_cache_repair "$release_dir" "$release_sha" "$migration_filename" "$migration_checksum" || return 1
  run_docker_compose "$release_dir" "$release_sha" "$migration_filename" "$migration_checksum" up -d --build --remove-orphans || return 1
  run_docker_compose "$release_dir" "$release_sha" "$migration_filename" "$migration_checksum" ps || return 1
}

derive_performance_summary_url() {
  case "$1" in
    */api/readyz) printf '%s\n' "${1%/api/readyz}/api/performance-reports/summary" ;;
    *) printf '%s\n' "${1%/}/api/performance-reports/summary" ;;
  esac
}

verify_readyz_identity() {
  RELEASE_SHA_TO_VERIFY="$2" DEPLOY_TARGET_TO_VERIFY="$DEPLOY_TARGET" EXPECTED_PROJECT_REF_TO_VERIFY="$expected_public_project_ref" \
    node --input-type=module - "$1" <<'NODE'
import { readFileSync } from 'node:fs';
const readiness = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (readiness.status !== 'ready'
  || readiness.build?.releaseSha !== process.env.RELEASE_SHA_TO_VERIFY
  || readiness.build?.deployTarget !== process.env.DEPLOY_TARGET_TO_VERIFY
  || readiness.build?.supabaseProjectRef !== process.env.EXPECTED_PROJECT_REF_TO_VERIFY
  || readiness.build?.databaseProjectRef !== process.env.EXPECTED_PROJECT_REF_TO_VERIFY) process.exit(1);
NODE
}

verify_release_health() {
  local expected_sha="$1" internal_file public_file hsts_header_present=false
  local redirect_result redirect_status redirect_url performance_url
  internal_file="/tmp/project-management-health-${expected_sha}.json"
  public_file="/tmp/project-management-public-health-${expected_sha}.json"
  node "$ACTIVE_RELEASE_DIR/scripts/classify-public-ingress-url.mjs" \
    --url "$HEALTH_URL" \
    --redirect-url "$HTTP_REDIRECT_URL" \
    --environment "$DEPLOY_TARGET" \
    --expected-host "$EXPECTED_PUBLIC_HOST" \
    --expected-mode "$PUBLIC_INGRESS_MODE" \
    > "/tmp/project-management-ingress-classification-${expected_sha}.json" || return 1
  retry 12 5 curl --fail --silent --show-error "$INTERNAL_HEALTH_URL" -o "$internal_file" || return 1
  verify_readyz_identity "$internal_file" "$expected_sha" || return 1
  curl --fail --silent --show-error "$HEALTH_URL" -o "$public_file" || return 1
  verify_readyz_identity "$public_file" "$expected_sha" || return 1
  if curl --silent --show-error --head "$HEALTH_URL" | tr -d '\r' | grep -qi '^strict-transport-security:'; then
    hsts_header_present=true
  elif [ "$PUBLIC_INGRESS_MODE" = domain_hsts ]; then
    echo "Public HTTPS response is missing Strict-Transport-Security." >&2
    return 1
  fi
  redirect_result="$(curl --silent --show-error --max-time 15 --max-redirs 0 --output /dev/null --write-out '%{http_code} %{redirect_url}' "$HTTP_REDIRECT_URL")" || return 1
  redirect_status="${redirect_result%% *}"
  redirect_url="${redirect_result#* }"
  case "$redirect_status" in 301|302|307|308) ;; *) return 1 ;; esac
  [ "$redirect_url" = "$HEALTH_URL" ] || return 1
  performance_url="${PERFORMANCE_SUMMARY_URL:-$(derive_performance_summary_url "$HEALTH_URL")}"
  curl --fail --silent --show-error "$performance_url" -o /tmp/project-management-performance-summary.json || return 1
  if [ "$PUBLIC_INGRESS_MODE" = temporary_ip_tls ]; then
    printf '{"transportTlsReady":true,"temporaryIngressReady":true,"hstsHeaderPresent":%s,"hstsUserAgentPolicyApplicable":false,"domainHstsReady":false}\n' "$hsts_header_present"
  else
    printf '%s\n' '{"transportTlsReady":true,"temporaryIngressReady":false,"hstsHeaderPresent":true,"hstsUserAgentPolicyApplicable":true,"domainHstsReady":true}'
  fi
}

validate_release_archive() {
  tar -tzf "$1" | awk '{ name=$0; sub(/^\.\//, "", name); if (name ~ /^\// || name ~ /(^|\/)\.\.($|\/)/ || name == "deploy/env/server.production.env") exit 1 }'
}

quarantine_release_dir() {
  local release_dir="$1" release_sha="$2" current_target
  [ -d "$release_dir" ] || return 0
  current_target="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
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
  current_target="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
  if [ -n "$previous_target" ]; then
    case "$previous_target" in "$RELEASES_DIR"/*) ;; *) return 1 ;; esac
    [ -d "$previous_target" ] || return 1
    case "$current_target" in "$activated_target"|"$previous_target") ;; *) return 1 ;; esac
    previous_sha="$(release_sha_from_manifest "$previous_target")" || return 1
    build_and_up_release "$previous_target" "$previous_sha" || return 1
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
  set_release_contract "$snapshot_candidate" "$previous_sha" || { rm -rf "$snapshot_candidate"; return 1; }
  mv "$snapshot_candidate" "$snapshot_dir" || return 1
  atomic_link "$snapshot_dir" || return 1
  printf '%s' "$snapshot_dir"
}

deployment_failure() {
  local exit_code=$? rollback_status=0
  trap - ERR INT TERM
  set +e
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
PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
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
set_release_contract "$CANDIDATE_DIR" "$RELEASE_SHA"
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
