#!/usr/bin/env bash
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${DEPLOY_TARGET:?DEPLOY_TARGET is required}"

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.lighthouse.yml}"
ENV_FILE="${ENV_FILE:-deploy/env/server.production.env}"
HEALTH_URL="${HEALTH_URL:-}"
HTTP_REDIRECT_URL="${HTTP_REDIRECT_URL:-}"
PUBLIC_INGRESS_MODE="${PUBLIC_INGRESS_MODE:-}"
EXPECTED_PUBLIC_HOST="${EXPECTED_PUBLIC_HOST:-}"
PERFORMANCE_SUMMARY_URL="${PERFORMANCE_SUMMARY_URL:-}"

: "${HEALTH_URL:?External HTTPS HEALTH_URL is required}"
: "${HTTP_REDIRECT_URL:?External HTTP redirect URL is required}"
: "${PUBLIC_INGRESS_MODE:?PUBLIC_INGRESS_MODE is required}"
: "${EXPECTED_PUBLIC_HOST:?EXPECTED_PUBLIC_HOST is required}"
case "$HEALTH_URL" in
  https://*) ;;
  *)
    echo "External deployment health URL must use https://: $HEALTH_URL" >&2
    exit 1
    ;;
esac
case "$HTTP_REDIRECT_URL" in
  http://*) ;;
  *)
    echo "External deployment redirect URL must use http://: $HTTP_REDIRECT_URL" >&2
    exit 1
    ;;
esac
case "$PUBLIC_INGRESS_MODE" in
  domain_hsts|temporary_ip_tls) ;;
  *)
    echo "Unsupported PUBLIC_INGRESS_MODE: $PUBLIC_INGRESS_MODE" >&2
    exit 1
    ;;
esac

case "$APP_DIR" in
  "~") APP_DIR="$HOME" ;;
  "~/"*) APP_DIR="$HOME/${APP_DIR#"~/"}" ;;
esac

cd "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env file: $APP_DIR/$ENV_FILE" >&2
  exit 1
fi

backup_tracked_changes() {
  local backup_dir="$1"
  local changed_names_file

  mkdir -p "$backup_dir/files"
  git status --porcelain --untracked-files=no > "$backup_dir/status.txt"
  git diff --binary > "$backup_dir/unstaged.diff" || true
  git diff --cached --binary > "$backup_dir/staged.diff" || true

  changed_names_file="$(mktemp)"
  git diff --name-only -z > "$changed_names_file"
  git diff --cached --name-only -z >> "$changed_names_file"

  sort -zu "$changed_names_file" | while IFS= read -r -d '' changed_path; do
    if [ -e "$changed_path" ]; then
      mkdir -p "$backup_dir/files/$(dirname "$changed_path")"
      cp -a -- "$changed_path" "$backup_dir/files/$changed_path"
    fi
  done

  rm -f "$changed_names_file"
}

if [ -d .git ]; then
  tracked_changes="$(git status --porcelain --untracked-files=no)"
  if [ -n "$tracked_changes" ] && [ -z "${RELEASE_ARCHIVE:-}" ] && [ "${ALLOW_DIRTY_DEPLOY:-}" != "1" ]; then
    echo "Deployment directory has tracked local changes. Refusing to overwrite them." >&2
    echo "$tracked_changes" >&2
    echo "Clean or back up the server working tree, or set ALLOW_DIRTY_DEPLOY=1 intentionally." >&2
    exit 1
  fi

  if [ -n "$tracked_changes" ]; then
    dirty_backup_dir="${DIRTY_DEPLOY_BACKUP_ROOT:-deploy/backups/dirty-working-tree}/$(date -u +%Y%m%dT%H%M%SZ)-${RELEASE_SHA:0:12}"
    echo "Deployment directory has tracked local changes. Backing them up to $APP_DIR/$dirty_backup_dir before deploying."
    echo "$tracked_changes"
    backup_tracked_changes "$dirty_backup_dir"
  fi
elif [ -z "${RELEASE_ARCHIVE:-}" ]; then
  echo "Deployment directory is not a git repository: $APP_DIR" >&2
  exit 1
fi

read_env_value() {
  awk -F= -v key="$1" '
    $1 == key {
      sub(/^[^=]*=/, "")
      sub(/\r$/, "")
      value = $0
    }
    END { print value }
  ' "$ENV_FILE"
}

if [ -n "$(read_env_value SUPABASE_SERVICE_KEY)" ]; then
  echo "SUPABASE_SERVICE_KEY is forbidden in the API runtime env file; use an isolated migration/admin worker." >&2
  exit 1
fi
if [ -z "$(read_env_value SUPABASE_RUNTIME_KEY)" ]; then
  echo "SUPABASE_RUNTIME_KEY is required and must represent a non-BYPASSRLS application role." >&2
  exit 1
fi

WEB_PORT_VALUE="$(read_env_value WEB_PORT)"
WEB_PORT_VALUE="${WEB_PORT_VALUE:-8080}"
INTERNAL_HEALTH_URL="http://127.0.0.1:${WEB_PORT_VALUE}/api/readyz"

if [ -z "${VITE_SUPABASE_URL:-}" ]; then
  VITE_SUPABASE_URL="$(read_env_value VITE_SUPABASE_URL)"
fi
if [ -z "${VITE_SUPABASE_URL:-}" ]; then
  VITE_SUPABASE_URL="$(read_env_value SUPABASE_URL)"
fi
if [ -z "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  VITE_SUPABASE_ANON_KEY="$(read_env_value VITE_SUPABASE_ANON_KEY)"
fi
if [ -z "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  VITE_SUPABASE_ANON_KEY="$(read_env_value SUPABASE_ANON_KEY)"
fi

: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL or SUPABASE_URL is required in $ENV_FILE}"
: "${VITE_SUPABASE_ANON_KEY:?VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY is required in $ENV_FILE}"
export VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY

if docker info >/dev/null 2>&1; then
  USE_SUDO_DOCKER=0
elif sudo -n docker info >/dev/null 2>&1; then
  USE_SUDO_DOCKER=1
else
  echo "Docker is not available for the deploy user. Add the user to the docker group or allow passwordless sudo docker." >&2
  exit 1
fi

run_docker_compose() {
  if [ "$USE_SUDO_DOCKER" = "1" ]; then
    sudo -n env \
      RELEASE_SHA="$RELEASE_SHA" \
      DEPLOY_TARGET="$DEPLOY_TARGET" \
      EXPECTED_SCHEMA_MIGRATION_FILENAME="$EXPECTED_SCHEMA_MIGRATION_FILENAME" \
      EXPECTED_SCHEMA_MIGRATION_CHECKSUM="$EXPECTED_SCHEMA_MIGRATION_CHECKSUM" \
      VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
      VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
      docker compose "$@"
  else
    docker compose "$@"
  fi
}

retry() {
  local max_attempts="$1"
  local delay_seconds="$2"
  shift 2

  local attempt=1
  until "$@"; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      return 1
    fi

    echo "Command failed, retrying in ${delay_seconds}s (${attempt}/${max_attempts})..." >&2
    sleep "$delay_seconds"
    attempt=$((attempt + 1))
  done
}

run_docker_builder_prune() {
  if [ "$USE_SUDO_DOCKER" = "1" ]; then
    sudo -n docker builder prune -af
  else
    docker builder prune -af
  fi
}

run_api_build_with_cache_repair() {
  local build_log="/tmp/project-management-build-api.log"
  if run_docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api 2>&1 | tee "$build_log"; then
    return 0
  fi

  if grep -Eq 'failed to prepare extraction snapshot|parent snapshot .* does not exist' "$build_log"; then
    echo "Docker build cache snapshot corruption detected; pruning builder cache and retrying once." >&2
    run_docker_builder_prune
    run_docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api
    return $?
  fi

  return 1
}

derive_performance_summary_url() {
  local health_url="$1"
  case "$health_url" in
    */api/readyz) echo "${health_url%/api/readyz}/api/performance-reports/summary" ;;
    */api/readyz) echo "${health_url%/api/readyz}/api/performance-reports/summary" ;;
    *) echo "${health_url%/}/api/performance-reports/summary" ;;
  esac
}

if [ -n "${RELEASE_ARCHIVE:-}" ]; then
  if [ ! -f "$RELEASE_ARCHIVE" ]; then
    echo "Missing release archive: $RELEASE_ARCHIVE" >&2
    exit 1
  fi

  echo "Deploying release archive for $RELEASE_SHA"
  if [ -d .git ]; then
    git ls-files -z | xargs -0 -r rm -f --
  fi
  rm -rf client/dist
  tar -xzf "$RELEASE_ARCHIVE" -C "$APP_DIR"
  rm -f "$RELEASE_ARCHIVE"
elif [ -d .git ]; then
  retry 5 10 git fetch --depth=1 origin "$RELEASE_SHA"
  git checkout --force "$RELEASE_SHA"
else
  echo "Deployment directory is not a git repository and no release archive was provided: $APP_DIR" >&2
  exit 1
fi

FRONTEND_BUILD_MANIFEST="client/dist/workbuddy-build.json"
if [ ! -f "$FRONTEND_BUILD_MANIFEST" ]; then
  echo "Missing tested frontend build provenance: $APP_DIR/$FRONTEND_BUILD_MANIFEST" >&2
  exit 1
fi
if ! grep -Fq "\"releaseSha\": \"$RELEASE_SHA\"" "$FRONTEND_BUILD_MANIFEST"; then
  echo "Frontend build provenance does not match release SHA $RELEASE_SHA" >&2
  exit 1
fi

node scripts/classify-public-ingress-url.mjs \
  --url "$HEALTH_URL" \
  --redirect-url "$HTTP_REDIRECT_URL" \
  --environment "$DEPLOY_TARGET" \
  --expected-host "$EXPECTED_PUBLIC_HOST" \
  --expected-mode "$PUBLIC_INGRESS_MODE" \
  >/tmp/project-management-public-ingress-policy.json
cat /tmp/project-management-public-ingress-policy.json

LATEST_SCHEMA_MIGRATION_PATH="$(find server/migrations -maxdepth 1 -type f -name '[0-9]*_*.sql' -print | sort -V | tail -n 1)"
if [ -z "$LATEST_SCHEMA_MIGRATION_PATH" ] || [ ! -f "$LATEST_SCHEMA_MIGRATION_PATH" ]; then
  echo "No managed schema migration found in the release tree." >&2
  exit 1
fi
EXPECTED_SCHEMA_MIGRATION_FILENAME="$(basename "$LATEST_SCHEMA_MIGRATION_PATH")"
EXPECTED_SCHEMA_MIGRATION_CHECKSUM="$(sha256sum "$LATEST_SCHEMA_MIGRATION_PATH" | awk '{print $1}')"
if [ -z "$EXPECTED_SCHEMA_MIGRATION_CHECKSUM" ]; then
  echo "Unable to calculate release migration checksum: $LATEST_SCHEMA_MIGRATION_PATH" >&2
  exit 1
fi
export EXPECTED_SCHEMA_MIGRATION_FILENAME EXPECTED_SCHEMA_MIGRATION_CHECKSUM

mkdir -p deploy/data/logs

run_api_build_with_cache_repair
run_docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
run_docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

curl --fail --silent --show-error "$INTERNAL_HEALTH_URL" >/tmp/project-management-health.json
cat /tmp/project-management-health.json

if [ "$HEALTH_URL" != "$INTERNAL_HEALTH_URL" ]; then
  case "$HEALTH_URL" in
    https://*) ;;
    *)
      echo "External deployment health URL must use https://: $HEALTH_URL" >&2
      exit 1
      ;;
  esac

  curl --fail --silent --show-error "$HEALTH_URL" >/tmp/project-management-public-health.json
  cat /tmp/project-management-public-health.json
  if ! curl --fail --silent --show-error --head "$HEALTH_URL" \
    | tr -d '\r' \
    | grep -qi '^strict-transport-security:'; then
    echo "Public HTTPS response is missing Strict-Transport-Security: $HEALTH_URL" >&2
    exit 1
  fi

  redirect_result="$(curl --silent --show-error --max-time 15 --max-redirs 0 --output /dev/null --write-out '%{http_code} %{redirect_url}' "$HTTP_REDIRECT_URL")"
  redirect_status="${redirect_result%% *}"
  redirect_url="${redirect_result#* }"
  case "$redirect_status" in
    301|302|307|308) ;;
    *)
      echo "Public HTTP endpoint did not redirect to HTTPS: $HTTP_REDIRECT_URL ($redirect_status)" >&2
      exit 1
      ;;
  esac
  case "$redirect_url" in
    https://*) ;;
    *)
      echo "Public HTTP redirect target is not HTTPS: $redirect_url" >&2
      exit 1
      ;;
  esac
  if [ "$redirect_url" != "$HEALTH_URL" ]; then
    echo "Public HTTP redirect target does not exactly match the HTTPS health URL." >&2
    exit 1
  fi

  if [ "$PUBLIC_INGRESS_MODE" = "temporary_ip_tls" ]; then
    printf '%s\n' '{"transportTlsReady":true,"temporaryIngressReady":true,"hstsHeaderPresent":true,"hstsUserAgentPolicyApplicable":false,"domainHstsReady":false}'
  else
    printf '%s\n' '{"transportTlsReady":true,"temporaryIngressReady":false,"hstsHeaderPresent":true,"hstsUserAgentPolicyApplicable":true,"domainHstsReady":true}'
  fi
fi

if [ -z "$PERFORMANCE_SUMMARY_URL" ]; then
  PERFORMANCE_SUMMARY_URL="$(derive_performance_summary_url "$HEALTH_URL")"
fi

curl --fail --silent --show-error "$PERFORMANCE_SUMMARY_URL" >/tmp/project-management-performance-summary.json
cat /tmp/project-management-performance-summary.json
