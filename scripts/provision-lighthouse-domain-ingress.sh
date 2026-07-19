#!/usr/bin/env bash
set -euo pipefail

ACTION="${ACTION:-activate}"
ROOT_DIR="${ROOT_DIR:-/opt/workbuddy-ingress}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-workbuddy-ingress}"
CADDY_IMAGE="caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d"
STATE_FILE="$ROOT_DIR/pending-activation.env"
EXPECTED_PRODUCTION_HOST="${EXPECTED_PRODUCTION_HOST:-zhuxucloud.com}"
EXPECTED_STAGING_HOST="${EXPECTED_STAGING_HOST:-staging.zhuxucloud.com}"
PRODUCTION_PROJECT_REF="${PRODUCTION_PROJECT_REF:-wwdrkjnbvcbfytwnnyvs}"
STAGING_PROJECT_REF="${STAGING_PROJECT_REF:-xemqmqpifsstkovbkatp}"

require_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || {
    echo "release SHA must be a full lowercase Git SHA" >&2
    exit 2
  }
}

require_hostname() {
  [[ "$1" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || {
    echo "public host must be a normalized DNS hostname" >&2
    exit 2
  }
}

compose_file_for() {
  printf '%s/deploy/docker-compose.ingress.yml' "$1"
}

env_file_for() {
  printf '%s/env/ingress.env' "$1"
}

compose_up() {
  local release_dir="$1"
  docker compose \
    --project-name "$COMPOSE_PROJECT" \
    --env-file "$(env_file_for "$release_dir")" \
    --file "$(compose_file_for "$release_dir")" \
    up -d --remove-orphans
}

compose_down() {
  local release_dir="$1"
  docker compose \
    --project-name "$COMPOSE_PROJECT" \
    --env-file "$(env_file_for "$release_dir")" \
    --file "$(compose_file_for "$release_dir")" \
    down
}

atomic_link() {
  local target="$1"
  ln -sfn "$target" "$ROOT_DIR/current.next" || return 1
  mv -Tf "$ROOT_DIR/current.next" "$ROOT_DIR/current" || return 1
}

load_state() {
  [ -f "$STATE_FILE" ] || {
    echo "No pending ingress activation exists." >&2
    exit 2
  }
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  : "${ACTIVATED_TARGET:?pending activation is missing ACTIVATED_TARGET}"
  : "${ACTIVATED_SHA:?pending activation is missing ACTIVATED_SHA}"
  PREVIOUS_TARGET="${PREVIOUS_TARGET:-}"
}

write_activation_state() {
  local state_candidate="${STATE_FILE}.next.$$"
  rm -f "$state_candidate" || return 1
  if ! {
    printf 'ACTIVATED_SHA=%q\n' "$RELEASE_SHA"
    printf 'ACTIVATED_TARGET=%q\n' "$RELEASE_DIR"
    printf 'PREVIOUS_TARGET=%q\n' "$PREVIOUS_TARGET"
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

rollback() {
  local failed_sha="${FAILED_RELEASE_SHA:-}"
  local current_target
  require_sha "$failed_sha"
  load_state
  [ "$ACTIVATED_SHA" = "$failed_sha" ] || {
    echo "Pending activation SHA does not match the rollback request." >&2
    return 2
  }
  current_target="$(readlink -f "$ROOT_DIR/current" 2>/dev/null || true)"

  if [ -n "$PREVIOUS_TARGET" ] && [ -d "$PREVIOUS_TARGET" ]; then
    case "$current_target" in
      "$ACTIVATED_TARGET"|"$PREVIOUS_TARGET") ;;
      *)
        echo "Current ingress release changed; refusing stale rollback." >&2
        return 2
        ;;
    esac
    compose_up "$PREVIOUS_TARGET" || return 1
    atomic_link "$PREVIOUS_TARGET" || return 1
  else
    case "$current_target" in
      "$ACTIVATED_TARGET"|'') ;;
      *)
        echo "Current ingress release changed; refusing stale rollback." >&2
        return 2
        ;;
    esac
    compose_down "$ACTIVATED_TARGET" || return 1
    rm -f "$ROOT_DIR/current" || return 1
  fi
  if [[ "$ACTIVATED_TARGET" == "$ROOT_DIR/releases/"* ]] && [ -d "$ACTIVATED_TARGET" ]; then
    mkdir -p "$ROOT_DIR/failed" || return 1
    mv "$ACTIVATED_TARGET" "$ROOT_DIR/failed/${ACTIVATED_SHA}-$(date -u +%Y%m%dT%H%M%SZ)-$$" || return 1
  fi
  rm -f "$STATE_FILE" || return 1
  printf '%s\n' '{"status":"rolled_back","sourceMutation":false,"databaseMutation":false}'
}

commit_activation() {
  local activated_sha="${RELEASE_SHA:-}"
  require_sha "$activated_sha"
  if [ ! -f "$STATE_FILE" ]; then
    [ "$(readlink -f "$ROOT_DIR/current" 2>/dev/null || true)" = "$ROOT_DIR/releases/$activated_sha" ] || {
      echo "No matching active ingress release exists for idempotent commit." >&2
      exit 2
    }
    printf '%s\n' '{"status":"already_committed","sourceMutation":false,"databaseMutation":false}'
    return
  fi
  load_state
  [ "$ACTIVATED_SHA" = "$activated_sha" ] || {
    echo "Pending activation SHA does not match commit request." >&2
    exit 2
  }
  [ "$(readlink -f "$ROOT_DIR/current" 2>/dev/null || true)" = "$ACTIVATED_TARGET" ] || {
    echo "Current ingress release changed; refusing stale commit." >&2
    exit 2
  }
  rm -f "$STATE_FILE"
  printf '%s\n' '{"status":"committed","sourceMutation":false,"databaseMutation":false}'
}

mkdir -p "$ROOT_DIR"
exec 9>"$ROOT_DIR/.provision.lock"
flock -n 9 || {
  echo "Another ingress operation is active." >&2
  exit 3
}

case "$ACTION" in
  rollback)
    rollback
    exit 0
    ;;
  commit)
    commit_activation
    exit 0
    ;;
  activate) ;;
  *)
    echo "ACTION must be activate, rollback, or commit" >&2
    exit 2
    ;;
esac

: "${RELEASE_SHA:?RELEASE_SHA is required}"
: "${RELEASE_ARCHIVE:?RELEASE_ARCHIVE is required}"
: "${PRODUCTION_HOST:?PRODUCTION_HOST is required}"
: "${STAGING_HOST:?STAGING_HOST is required}"
BOOTSTRAP_MODE="${BOOTSTRAP_MODE:-upgrade}"

require_sha "$RELEASE_SHA"
require_hostname "$PRODUCTION_HOST"
require_hostname "$STAGING_HOST"
[ "$PRODUCTION_HOST" = "$EXPECTED_PRODUCTION_HOST" ] || {
  echo "Production host does not match the governed authority map." >&2
  exit 2
}
[ "$STAGING_HOST" = "$EXPECTED_STAGING_HOST" ] || {
  echo "Staging host does not match the governed authority map." >&2
  exit 2
}
case "$BOOTSTRAP_MODE" in
  initial|upgrade) ;;
  *) echo "BOOTSTRAP_MODE must be initial or upgrade" >&2; exit 2 ;;
esac
[ -f "$RELEASE_ARCHIVE" ] || {
  echo "Ingress release archive is missing." >&2
  exit 2
}
if [ -f "$STATE_FILE" ]; then
  load_state
  stale_activation_sha="$ACTIVATED_SHA"
  echo "Recovering a pending ingress activation before retrying."
  FAILED_RELEASE_SHA="$stale_activation_sha" rollback
fi

RELEASE_DIR="$ROOT_DIR/releases/$RELEASE_SHA"
CANDIDATE_DIR="$ROOT_DIR/.candidate-$RELEASE_SHA-$$"
PREVIOUS_TARGET="$(readlink -f "$ROOT_DIR/current" 2>/dev/null || true)"
ACTIVATED=false

restore_on_failure() {
  local exit_code=$?
  local cleanup_status=0
  local recovery_status=0
  local recovery_kind=none
  trap - ERR INT TERM
  set +e
  rm -rf "$CANDIDATE_DIR"
  cleanup_status=$?
  if [ "$ACTIVATED" = true ] || { [ -n "${STATE_FILE:-}" ] && [ -f "$STATE_FILE" ]; }; then
    recovery_kind=rollback
    FAILED_RELEASE_SHA="$RELEASE_SHA" rollback
    recovery_status=$?
  elif [ -n "${RELEASE_DIR:-}" ] && [ -d "$RELEASE_DIR" ]; then
    recovery_kind=quarantine
    if [ "$RELEASE_DIR" = "$ROOT_DIR/releases/$RELEASE_SHA" ]; then
      mkdir -p "$ROOT_DIR/failed" \
        && mv "$RELEASE_DIR" "$ROOT_DIR/failed/${RELEASE_SHA}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
      recovery_status=$?
    else
      recovery_status=2
    fi
  fi
  if [ "$cleanup_status" -ne 0 ]; then
    echo "Ingress candidate cleanup did not complete; rollback was still attempted." >&2
  fi
  if [ "$recovery_status" -ne 0 ]; then
    if [ "$recovery_kind" = rollback ]; then
      echo "Ingress rollback did not complete; pending activation state was preserved for recovery." >&2
    else
      echo "Ingress failed release quarantine did not complete; the immutable release was preserved for recovery." >&2
    fi
  fi
  exit "$exit_code"
}
trap restore_on_failure ERR INT TERM

if [ -d "$RELEASE_DIR" ] \
  && [ "$(readlink -f "$ROOT_DIR/current" 2>/dev/null || true)" = "$RELEASE_DIR" ]; then
  trap - ERR INT TERM
  printf '%s\n' '{"status":"already_active","sourceMutation":false,"databaseMutation":false}'
  exit 0
fi
[ ! -e "$RELEASE_DIR" ] || {
  echo "Ingress release already exists; refusing to overwrite it." >&2
  exit 2
}
mkdir -p "$CANDIDATE_DIR" "$ROOT_DIR/data" "$ROOT_DIR/config"
tar -xzf "$RELEASE_ARCHIVE" -C "$CANDIDATE_DIR"
[ -f "$CANDIDATE_DIR/deploy/ingress/Caddyfile" ]
[ -f "$CANDIDATE_DIR/deploy/docker-compose.ingress.yml" ]
mkdir -p "$CANDIDATE_DIR/env"
write_ingress_env() {
  local config_root="$1"
  local destination="$2"
  cat > "$destination" <<EOF
PRODUCTION_HOST=$PRODUCTION_HOST
STAGING_HOST=$STAGING_HOST
INGRESS_ENV_FILE=$config_root/env/ingress.env
INGRESS_CADDYFILE=$config_root/deploy/ingress/Caddyfile
CADDY_DATA_DIR=$ROOT_DIR/data
CADDY_CONFIG_DIR=$ROOT_DIR/config
EOF
  chmod 600 "$destination"
}
write_ingress_env "$CANDIDATE_DIR" "$CANDIDATE_DIR/env/ingress.env"

docker pull "$CADDY_IMAGE" >/dev/null
docker image inspect "$CADDY_IMAGE" >/dev/null
docker compose \
  --project-name "$COMPOSE_PROJECT" \
  --env-file "$CANDIDATE_DIR/env/ingress.env" \
  --file "$CANDIDATE_DIR/deploy/docker-compose.ingress.yml" \
  config >/dev/null
docker run --rm \
  --env-file "$CANDIDATE_DIR/env/ingress.env" \
  --volume "$CANDIDATE_DIR/deploy/ingress/Caddyfile:/etc/caddy/Caddyfile:ro" \
  "$CADDY_IMAGE" \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

mkdir -p "$ROOT_DIR/releases"
write_ingress_env "$RELEASE_DIR" "$CANDIDATE_DIR/env/ingress.env"
mv "$CANDIDATE_DIR" "$RELEASE_DIR"
write_activation_state
atomic_link "$RELEASE_DIR"
ACTIVATED=true
compose_up "$RELEASE_DIR"

probe_redirect() {
  local host="$1"
  local result status location
  result="$(curl --silent --show-error --max-time 20 --max-redirs 0 \
    --resolve "$host:80:127.0.0.1" \
    --output /dev/null --write-out '%{http_code} %{redirect_url}' \
    "http://$host/api/readyz")"
  status="${result%% *}"
  location="${result#* }"
  [ "$status" = 308 ] && [ "$location" = "https://$host/api/readyz" ]
}

probe_https() {
  local host="$1"
  local expected_target="$2"
  local expected_project_ref="$3"
  local headers="$ROOT_DIR/.headers-$host-$$"
  local body="$ROOT_DIR/.body-$host-$$"
  local status
  if ! status="$(curl --silent --show-error --max-time 45 \
    --resolve "$host:443:127.0.0.1" \
    --dump-header "$headers" --output "$body" --write-out '%{http_code}' \
    "https://$host/api/readyz")"; then
    rm -f "$headers" "$body"
    return 1
  fi
  if ! tr -d '\r' < "$headers" | grep -qi '^strict-transport-security:'; then
    rm -f "$headers" "$body"
    return 1
  fi
  if [ "$status" = 200 ]; then
    if ! node --input-type=module - "$body" "$expected_target" "$expected_project_ref" <<'NODE'
import { readFileSync } from 'node:fs';
const readiness = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const expectedTarget = process.argv[3];
const expectedProjectRef = process.argv[4];
if (readiness.status !== 'ready'
  || readiness.build?.deployTarget !== expectedTarget
  || readiness.build?.supabaseProjectRef !== expectedProjectRef
  || readiness.build?.databaseProjectRef !== expectedProjectRef) {
  process.exit(1);
}
NODE
    then
      rm -f "$headers" "$body"
      return 1
    fi
  fi
  rm -f "$headers" "$body"
  printf '%s' "$status"
}

for attempt in $(seq 1 18); do
  if probe_redirect "$PRODUCTION_HOST" && probe_redirect "$STAGING_HOST"; then
    if production_status="$(probe_https "$PRODUCTION_HOST" production "$PRODUCTION_PROJECT_REF")" \
      && staging_status="$(probe_https "$STAGING_HOST" staging "$STAGING_PROJECT_REF")"; then
      break
    fi
  fi
  if [ "$attempt" -eq 18 ]; then
    echo "Domain TLS or redirect probes did not become ready." >&2
    exit 1
  fi
  sleep 5
done

classification=ingress_ready
if [ "$BOOTSTRAP_MODE" = initial ]; then
  for status in "$production_status" "$staging_status"; do
    case "$status" in
      200) ;;
      502) classification=ingress_ready_upstream_unavailable ;;
      *) echo "Initial ingress returned unexpected HTTPS status: $status" >&2; exit 1 ;;
    esac
  done
else
  [ "$production_status" = 200 ] && [ "$staging_status" = 200 ] || {
    echo "Upgrade ingress requires both existing runtimes to be ready." >&2
    exit 1
  }
fi

trap - ERR INT TERM
printf '{"status":"activated","classification":"%s","releaseSha":"%s","tlsReady":true,"redirectReady":true,"hstsHeaderPresent":true,"hstsUserAgentPolicyApplicable":true,"sourceMutation":false,"databaseMutation":false}\n' \
  "$classification" "$RELEASE_SHA"
