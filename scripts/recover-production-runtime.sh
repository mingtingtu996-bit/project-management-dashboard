#!/usr/bin/env bash
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${REPORT_FILE:?REPORT_FILE is required}"

RECOVERY_MODE="${RECOVERY_MODE:-manual}"
RECOVERY_TARGET="${RECOVERY_TARGET:-}"
RECOVERY_CONFIRMATION="${RECOVERY_CONFIRMATION:-}"
DEPLOY_TARGET="${DEPLOY_TARGET:-}"
PUBLIC_PROBE_CONFIGURED="${PUBLIC_PROBE_CONFIGURED:-false}"
PUBLIC_PROBE_HEALTHY="${PUBLIC_PROBE_HEALTHY:-false}"
ENV_FILE="${ENV_FILE:-deploy/env/server.production.env}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.lighthouse.yml}"

command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required on the recovery host." >&2
  exit 2
}

case "$REPORT_FILE" in
  /*) ;;
  *) REPORT_FILE="$PWD/$REPORT_FILE" ;;
esac
mkdir -p "$(dirname "$REPORT_FILE")"

generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
preflight_passed="false"
failure_reason="preflight_not_completed"
release_sha="unknown"
recovery_allowed="false"
recovery_attempted="false"
recovery_succeeded="false"
recovery_outcome="blocked"
selected_targets="none"
attempted_targets="none"
local_verification_passed="false"

api_status_before="unknown"
api_health_before="unknown"
api_probe_before="false"
api_exit_code_before="unknown"
api_status_after="unknown"
api_health_after="unknown"
api_probe_after="false"
apiUnhealthy="false"
apiExited="false"

web_status_before="unknown"
web_health_before="unknown"
web_probe_before="false"
web_exit_code_before="unknown"
web_status_after="unknown"
web_health_after="unknown"
web_probe_after="false"
webUnavailable="false"
webExited="false"

worker_status_before="unknown"
worker_health_before="unknown"
worker_probe_before="false"
worker_exit_code_before="unknown"
worker_status_after="unknown"
worker_health_after="unknown"
worker_probe_after="false"
workerUnhealthy="false"
workerExited="false"

healthCurlFailed="false"
diagnosis_codes="none"

write_report() {
  local temporary_report="${REPORT_FILE}.tmp"
  {
    printf 'schema_version=%s\n' 'workbuddy-production-runtime-recovery/v1'
    printf 'generated_at=%s\n' "$generated_at"
    printf 'preflight_passed=%s\n' "$preflight_passed"
    printf 'failure_reason=%s\n' "$failure_reason"
    printf 'recovery_mode=%s\n' "$RECOVERY_MODE"
    printf 'requested_target=%s\n' "$RECOVERY_TARGET"
    printf 'release_sha=%s\n' "$release_sha"
    printf 'public_probe_configured=%s\n' "$PUBLIC_PROBE_CONFIGURED"
    printf 'public_probe_before_passed=%s\n' "$PUBLIC_PROBE_HEALTHY"
    printf 'diagnosis_codes=%s\n' "$diagnosis_codes"
    printf 'apiUnhealthy=%s\n' "$apiUnhealthy"
    printf 'apiExited=%s\n' "$apiExited"
    printf 'healthCurlFailed=%s\n' "$healthCurlFailed"
    printf 'webUnavailable=%s\n' "$webUnavailable"
    printf 'webExited=%s\n' "$webExited"
    printf 'workerUnhealthy=%s\n' "$workerUnhealthy"
    printf 'workerExited=%s\n' "$workerExited"
    printf 'api_status_before=%s\n' "$api_status_before"
    printf 'api_health_before=%s\n' "$api_health_before"
    printf 'api_probe_before=%s\n' "$api_probe_before"
    printf 'api_exit_code_before=%s\n' "$api_exit_code_before"
    printf 'api_status_after=%s\n' "$api_status_after"
    printf 'api_health_after=%s\n' "$api_health_after"
    printf 'api_probe_after=%s\n' "$api_probe_after"
    printf 'web_status_before=%s\n' "$web_status_before"
    printf 'web_health_before=%s\n' "$web_health_before"
    printf 'web_probe_before=%s\n' "$web_probe_before"
    printf 'web_exit_code_before=%s\n' "$web_exit_code_before"
    printf 'web_status_after=%s\n' "$web_status_after"
    printf 'web_health_after=%s\n' "$web_health_after"
    printf 'web_probe_after=%s\n' "$web_probe_after"
    printf 'worker_status_before=%s\n' "$worker_status_before"
    printf 'worker_health_before=%s\n' "$worker_health_before"
    printf 'worker_probe_before=%s\n' "$worker_probe_before"
    printf 'worker_exit_code_before=%s\n' "$worker_exit_code_before"
    printf 'worker_status_after=%s\n' "$worker_status_after"
    printf 'worker_health_after=%s\n' "$worker_health_after"
    printf 'worker_probe_after=%s\n' "$worker_probe_after"
    printf 'recovery_allowed=%s\n' "$recovery_allowed"
    printf 'selected_targets=%s\n' "$selected_targets"
    printf 'recovery_attempted=%s\n' "$recovery_attempted"
    printf 'attempted_targets=%s\n' "$attempted_targets"
    printf 'local_verification_passed=%s\n' "$local_verification_passed"
    printf 'recovery_succeeded=%s\n' "$recovery_succeeded"
    printf 'recovery_outcome=%s\n' "$recovery_outcome"
    printf 'secret_values_written=%s\n' 'false'
    printf 'env_values_written=%s\n' 'false'
  } > "$temporary_report"
  mv "$temporary_report" "$REPORT_FILE"
}

on_exit() {
  local status=$?
  trap - EXIT
  write_report
  exit "$status"
}
trap on_exit EXIT

refuse() {
  failure_reason="$1"
  printf '%s\n' "$2" >&2
  exit 2
}

if [ "$DEPLOY_TARGET" != "production" ]; then
  refuse "environment_guard_failed" "Recovery requires DEPLOY_TARGET=production."
fi

[ "$RECOVERY_MODE" = "manual" ] || {
  refuse "mode_guard_failed" "Production runtime recovery is manual-only."
}

case "$RECOVERY_TARGET" in
  api|web|worker|all) ;;
  *) refuse "target_guard_failed" "Unsupported recovery target." ;;
esac

[ "$RECOVERY_CONFIRMATION" = "RESTART_PRODUCTION_RUNTIME" ] || {
  refuse "manual_guard_failed" "Refusing manual recovery without production environment, exact confirmation, and an explicit target."
}

case "$PUBLIC_PROBE_CONFIGURED" in
  true|false) ;;
  *) refuse "public_probe_configured_input_invalid" "Public probe configured input must be true or false." ;;
esac
[ "$PUBLIC_PROBE_CONFIGURED" = "true" ] || {
  refuse "public_probe_required" "The production public probe is required for runtime recovery."
}
case "$PUBLIC_PROBE_HEALTHY" in
  true|false) ;;
  *) refuse "public_probe_input_invalid" "Public probe input must be true or false." ;;
esac

case "$APP_DIR" in
  "~") APP_DIR="$HOME" ;;
  "~/"*) APP_DIR="$HOME/${APP_DIR#"~/"}" ;;
esac

if [ ! -d "$APP_DIR" ]; then
  refuse "app_dir_missing" "Production application directory is missing."
fi
cd "$APP_DIR"
APP_DIR="$PWD"
CURRENT_LINK="$APP_DIR/current"
PENDING_APPLICATION_STATE="$APP_DIR/pending-application-release.env"
exec 9>"$APP_DIR/.deploy.lock"
flock -n 9 || refuse "deployment_operation_active" "A production deployment or rollback operation is active."
[ ! -f "$PENDING_APPLICATION_STATE" ] || {
  refuse "pending_application_release" "A pending application activation must be recovered by the release workflow before runtime restart."
}

if [ -e "$CURRENT_LINK" ] || [ -L "$CURRENT_LINK" ]; then
  ACTIVE_RELEASE_DIR="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
  case "$ACTIVE_RELEASE_DIR" in
    "$APP_DIR/releases/"*) ;;
    *) refuse "current_release_pointer_invalid" "The current application pointer is outside the managed releases directory." ;;
  esac
  [ -d "$ACTIVE_RELEASE_DIR" ] || refuse "current_release_missing" "The current application release directory is missing."
else
  ACTIVE_RELEASE_DIR="$APP_DIR"
fi

case "$ENV_FILE" in
  /*) ;;
  ../*|*/../*) refuse "runtime_env_path_invalid" "Production runtime env path must stay inside the application root." ;;
  *) ENV_FILE="$APP_DIR/$ENV_FILE" ;;
esac
case "$COMPOSE_FILE" in
  /*) ;;
  ../*|*/../*) refuse "compose_contract_path_invalid" "Production Compose path must stay inside the active release." ;;
  *) COMPOSE_FILE="$ACTIVE_RELEASE_DIR/$COMPOSE_FILE" ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  refuse "runtime_env_missing" "Production runtime env file is missing."
fi
if [ ! -f "$COMPOSE_FILE" ]; then
  refuse "compose_contract_missing" "Production Compose contract is missing."
fi

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

active_release_sha="$(release_sha_from_manifest "$ACTIVE_RELEASE_DIR")" || {
  refuse "current_release_manifest_invalid" "The active release build manifest is missing or invalid."
}

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

if [ -z "$(read_env_value SUPABASE_RUNTIME_KEY)" ]; then
  refuse "runtime_key_missing" "SUPABASE_RUNTIME_KEY is required for runtime recovery."
fi
if [ -n "$(read_env_value SUPABASE_SERVICE_KEY)" ]; then
  refuse "privileged_key_forbidden" "SUPABASE_SERVICE_KEY is forbidden in the runtime env file."
fi

web_port="$(read_env_value WEB_PORT)"
web_port="${web_port:-8080}"
case "$web_port" in
  ''|*[!0-9]*) refuse "web_port_invalid" "WEB_PORT must be numeric." ;;
esac
local_web_health_url="http://127.0.0.1:${web_port}/api/readyz"

docker_cmd=()
if docker info >/dev/null 2>&1; then
  docker_cmd=(docker)
elif sudo -n docker info >/dev/null 2>&1; then
  docker_cmd=(sudo -n docker)
else
  refuse "docker_unavailable" "Docker is unavailable to the recovery account."
fi

container_exists() {
  "${docker_cmd[@]}" container inspect "$1" >/dev/null 2>&1
}

inspect_value() {
  "${docker_cmd[@]}" container inspect "$1" --format "$2" 2>/dev/null
}

container_env_value() {
  local container="$1"
  local key="$2"
  "${docker_cmd[@]}" container inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); value = $0 } END { print value }'
}

for container in project-management-web project-management-api project-management-worker; do
  if ! container_exists "$container"; then
    refuse "container_missing" "Required production runtime container is missing; a release operation is required."
  fi
done

if [ "$(inspect_value project-management-web '{{index .Config.Labels "com.docker.compose.service"}}')" != "web" ] \
  || [ "$(inspect_value project-management-api '{{index .Config.Labels "com.docker.compose.service"}}')" != "api" ] \
  || [ "$(inspect_value project-management-worker '{{index .Config.Labels "com.docker.compose.service"}}')" != "worker" ]; then
  refuse "container_identity_mismatch" "Container identity does not match the Web/API/worker Compose contract."
fi

api_target="$(container_env_value project-management-api DEPLOY_TARGET)"
worker_target="$(container_env_value project-management-worker DEPLOY_TARGET)"
web_target="$(container_env_value project-management-web DEPLOY_TARGET)"
api_release_sha="$(container_env_value project-management-api RELEASE_SHA)"
worker_release_sha="$(container_env_value project-management-worker RELEASE_SHA)"
web_release_sha="$(container_env_value project-management-web RELEASE_SHA)"
if [ "$api_target" != "production" ] || [ "$worker_target" != "production" ] || [ "$web_target" != "production" ]; then
  refuse "container_environment_mismatch" "Web, API, or worker container is not marked for production."
fi
if [ -z "$api_release_sha" ] || [ "$api_release_sha" != "$worker_release_sha" ] || [ "$api_release_sha" != "$web_release_sha" ]; then
  refuse "release_identity_mismatch" "Web, API, and worker release identities are missing or inconsistent."
fi
release_sha="$api_release_sha"
[ "$release_sha" = "$active_release_sha" ] || {
  refuse "current_release_identity_mismatch" "Running containers do not match the atomic current release."
}
preflight_passed="true"
failure_reason="none"

container_status() {
  inspect_value "$1" '{{.State.Status}}'
}

container_health() {
  inspect_value "$1" '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
}

container_exit_code() {
  inspect_value "$1" '{{.State.ExitCode}}'
}

probe_container_ready() {
  local container="$1"
  [ "$(container_status "$container")" = "running" ] || return 1
  "${docker_cmd[@]}" exec "$container" node -e \
    "fetch('http://127.0.0.1:3001/api/readyz').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1
}

probe_web_ready() {
  [ "$(container_status project-management-web)" = "running" ] || return 1
  curl --fail --silent --show-error --max-time 15 "$local_web_health_url" >/dev/null 2>&1
}

retry_probe() {
  local attempts="$1"
  shift
  local attempt
  for attempt in $(seq 1 "$attempts"); do
    if "$@"; then
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 2
    fi
  done
  return 1
}

bool_probe() {
  if retry_probe 2 "$@"; then
    printf 'true'
  else
    printf 'false'
  fi
}

api_status_before="$(container_status project-management-api)"
api_health_before="$(container_health project-management-api)"
api_exit_code_before="$(container_exit_code project-management-api)"
api_probe_before="$(bool_probe probe_container_ready project-management-api)"
web_status_before="$(container_status project-management-web)"
web_health_before="$(container_health project-management-web)"
web_exit_code_before="$(container_exit_code project-management-web)"
web_probe_before="$(bool_probe probe_web_ready)"
worker_status_before="$(container_status project-management-worker)"
worker_health_before="$(container_health project-management-worker)"
worker_exit_code_before="$(container_exit_code project-management-worker)"
worker_probe_before="$(bool_probe probe_container_ready project-management-worker)"

[ "$api_status_before" = "exited" ] && apiExited="true"
[ "$web_status_before" = "exited" ] && webExited="true"
[ "$worker_status_before" = "exited" ] && workerExited="true"
if [ "$api_health_before" = "unhealthy" ] || { [ "$api_status_before" = "running" ] && [ "$api_probe_before" != "true" ]; }; then
  apiUnhealthy="true"
fi
if [ "$worker_health_before" = "unhealthy" ] || { [ "$worker_status_before" = "running" ] && [ "$worker_probe_before" != "true" ]; }; then
  workerUnhealthy="true"
fi
if [ "$web_health_before" = "unhealthy" ] || { [ "$web_status_before" = "running" ] && [ "$web_probe_before" != "true" ]; }; then
  webUnavailable="true"
fi
if [ "$PUBLIC_PROBE_HEALTHY" != "true" ] || [ "$web_probe_before" != "true" ]; then
  healthCurlFailed="true"
fi

append_code() {
  if [ "$diagnosis_codes" = "none" ]; then
    diagnosis_codes="$1"
  else
    diagnosis_codes="${diagnosis_codes},$1"
  fi
}

[ "$apiExited" = "true" ] && append_code "api_exited"
[ "$apiUnhealthy" = "true" ] && append_code "api_unhealthy"
[ "$webExited" = "true" ] && append_code "web_exited"
[ "$webUnavailable" = "true" ] && append_code "web_readyz_failed"
[ "$workerExited" = "true" ] && append_code "worker_exited"
[ "$workerUnhealthy" = "true" ] && append_code "worker_unhealthy"
[ "$healthCurlFailed" = "true" ] && append_code "health_curl_failed"

recoverable_state() {
  case "$1" in
    exited|created|dead|restarting|paused) return 0 ;;
    *) return 1 ;;
  esac
}

api_recoverable="false"
worker_recoverable="false"
web_recoverable="false"
if recoverable_state "$api_status_before" || [ "$apiUnhealthy" = "true" ]; then
  api_recoverable="true"
fi
if recoverable_state "$worker_status_before" || [ "$workerUnhealthy" = "true" ]; then
  worker_recoverable="true"
fi
if recoverable_state "$web_status_before"; then
  web_recoverable="true"
elif [ "$webUnavailable" = "true" ] && [ "$api_probe_before" = "true" ]; then
  web_recoverable="true"
fi

target_requested() {
  case "$RECOVERY_TARGET" in
    all) return 0 ;;
    "$1") return 0 ;;
    *) return 1 ;;
  esac
}

selected_api="false"
selected_worker="false"
selected_web="false"
if [ "$api_recoverable" = "true" ] && target_requested api; then selected_api="true"; fi
if [ "$worker_recoverable" = "true" ] && target_requested worker; then selected_worker="true"; fi
if [ "$web_recoverable" = "true" ] && target_requested web; then selected_web="true"; fi

selected_list=()
[ "$selected_api" = "true" ] && selected_list+=(api)
[ "$selected_worker" = "true" ] && selected_list+=(worker)
[ "$selected_web" = "true" ] && selected_list+=(web)
if [ "${#selected_list[@]}" -gt 0 ]; then
  selected_targets="$(IFS=,; printf '%s' "${selected_list[*]}")"
  recovery_allowed="true"
fi

all_runtime_healthy="false"
if [ "$api_status_before" = "running" ] && [ "$api_health_before" = "healthy" ] && [ "$api_probe_before" = "true" ] \
  && [ "$worker_status_before" = "running" ] && [ "$worker_health_before" = "healthy" ] && [ "$worker_probe_before" = "true" ] \
  && [ "$web_status_before" = "running" ] && [ "$web_health_before" = "healthy" ] && [ "$web_probe_before" = "true" ]; then
  all_runtime_healthy="true"
fi

if [ "$recovery_allowed" != "true" ]; then
  api_status_after="$api_status_before"
  api_health_after="$api_health_before"
  api_probe_after="$api_probe_before"
  web_status_after="$web_status_before"
  web_health_after="$web_health_before"
  web_probe_after="$web_probe_before"
  worker_status_after="$worker_status_before"
  worker_health_after="$worker_health_before"
  worker_probe_after="$worker_probe_before"
  if [ "$all_runtime_healthy" = "true" ]; then
    local_verification_passed="true"
    if [ "$PUBLIC_PROBE_HEALTHY" = "true" ]; then
      recovery_outcome="healthy_no_action"
      failure_reason="none"
      exit 0
    fi
    recovery_outcome="blocked_external_probe_failure"
    failure_reason="public_probe_failed_while_runtime_healthy"
    exit 3
  fi
  recovery_outcome="blocked_no_matching_diagnosis"
  failure_reason="requested_target_has_no_clear_recoverable_diagnosis"
  exit 3
fi

recover_container() {
  local container="$1"
  local status="$2"
  case "$status" in
    running|restarting|paused) "${docker_cmd[@]}" restart "$container" >/dev/null ;;
    *) "${docker_cmd[@]}" start "$container" >/dev/null ;;
  esac
}

wait_container_ready() {
  local container="$1"
  local attempt
  for attempt in $(seq 1 20); do
    if [ "$(container_status "$container")" = "running" ] \
      && [ "$(container_health "$container")" = "healthy" ] \
      && probe_container_ready "$container"; then
      return 0
    fi
    sleep 3
  done
  return 1
}

wait_web_ready() {
  local attempt
  for attempt in $(seq 1 20); do
    if [ "$(container_health project-management-web)" = "healthy" ] && probe_web_ready; then
      return 0
    fi
    sleep 3
  done
  return 1
}

recovery_attempted="true"
attempted_list=()
action_failed="false"

if [ "$selected_api" = "true" ]; then
  attempted_list+=(api)
  if ! recover_container project-management-api "$api_status_before" || ! wait_container_ready project-management-api; then
    action_failed="true"
  fi
fi

if [ "$selected_worker" = "true" ]; then
  attempted_list+=(worker)
  if ! recover_container project-management-worker "$worker_status_before" || ! wait_container_ready project-management-worker; then
    action_failed="true"
  fi
fi

if [ "$selected_web" = "true" ]; then
  attempted_list+=(web)
  if ! retry_probe 2 probe_container_ready project-management-api \
    || ! recover_container project-management-web "$web_status_before" \
    || ! wait_web_ready; then
    action_failed="true"
  fi
fi

attempted_targets="$(IFS=,; printf '%s' "${attempted_list[*]}")"
api_status_after="$(container_status project-management-api)"
api_health_after="$(container_health project-management-api)"
api_probe_after="$(bool_probe probe_container_ready project-management-api)"
web_status_after="$(container_status project-management-web)"
web_health_after="$(container_health project-management-web)"
web_probe_after="$(bool_probe probe_web_ready)"
worker_status_after="$(container_status project-management-worker)"
worker_health_after="$(container_health project-management-worker)"
worker_probe_after="$(bool_probe probe_container_ready project-management-worker)"

if [ "$api_status_after" = "running" ] && [ "$api_health_after" = "healthy" ] && [ "$api_probe_after" = "true" ] \
  && [ "$worker_status_after" = "running" ] && [ "$worker_health_after" = "healthy" ] && [ "$worker_probe_after" = "true" ] \
  && [ "$web_status_after" = "running" ] && [ "$web_health_after" = "healthy" ] && [ "$web_probe_after" = "true" ]; then
  local_verification_passed="true"
fi

if [ "$action_failed" = "false" ] && [ "$local_verification_passed" = "true" ]; then
  recovery_succeeded="true"
  recovery_outcome="recovered_locally"
  failure_reason="none"
  exit 0
fi

recovery_outcome="recovery_failed"
failure_reason="container_action_or_local_verification_failed"
exit 4
