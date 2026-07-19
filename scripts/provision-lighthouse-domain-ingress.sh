#!/usr/bin/env bash
set -euo pipefail

ACTION="${ACTION:-activate}"
ROOT_DIR="${ROOT_DIR:-/opt/workbuddy-ingress}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-workbuddy-ingress}"
CADDY_IMAGE="caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d"
STATE_FILE="$ROOT_DIR/pending-activation.env"

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
    down || true
}

atomic_link() {
  local target="$1"
  ln -sfn "$target" "$ROOT_DIR/current.next"
  mv -Tf "$ROOT_DIR/current.next" "$ROOT_DIR/current"
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

rollback() {
  local failed_sha="${FAILED_RELEASE_SHA:-}"
  require_sha "$failed_sha"
  load_state
  [ "$ACTIVATED_SHA" = "$failed_sha" ] || {
    echo "Pending activation SHA does not match the rollback request." >&2
    exit 2
  }
  [ "$(readlink -f "$ROOT_DIR/current" 2>/dev/null || true)" = "$ACTIVATED_TARGET" ] || {
    echo "Current ingress release changed; refusing stale rollback." >&2
    exit 2
  }

  if [ -n "$PREVIOUS_TARGET" ] && [ -d "$PREVIOUS_TARGET" ]; then
    atomic_link "$PREVIOUS_TARGET"
    compose_up "$PREVIOUS_TARGET"
  else
    compose_down "$ACTIVATED_TARGET"
    rm -f "$ROOT_DIR/current"
  fi
  rm -f "$STATE_FILE"
  printf '%s\n' '{"status":"rolled_back","sourceMutation":false,"databaseMutation":false}'
}

commit_activation() {
  local activated_sha="${RELEASE_SHA:-}"
  require_sha "$activated_sha"
  load_state
  [ "$ACTIVATED_SHA" = "$activated_sha" ] || {
    echo "Pending activation SHA does not match commit request." >&2
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
[ "$PRODUCTION_HOST" != "$STAGING_HOST" ] || {
  echo "Production and staging hosts must differ." >&2
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
[ ! -f "$STATE_FILE" ] || {
  echo "A pending ingress activation must be committed or rolled back first." >&2
  exit 3
}

RELEASE_DIR="$ROOT_DIR/releases/$RELEASE_SHA"
CANDIDATE_DIR="$ROOT_DIR/.candidate-$RELEASE_SHA-$$"
PREVIOUS_TARGET="$(readlink -f "$ROOT_DIR/current" 2>/dev/null || true)"
ACTIVATED=false

restore_on_failure() {
  local exit_code=$?
  rm -rf "$CANDIDATE_DIR"
  if [ "$ACTIVATED" = true ]; then
    FAILED_RELEASE_SHA="$RELEASE_SHA" rollback || true
  fi
  exit "$exit_code"
}
trap restore_on_failure ERR INT TERM

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
{
  printf 'ACTIVATED_SHA=%q\n' "$RELEASE_SHA"
  printf 'ACTIVATED_TARGET=%q\n' "$RELEASE_DIR"
  printf 'PREVIOUS_TARGET=%q\n' "$PREVIOUS_TARGET"
} > "$STATE_FILE"
chmod 600 "$STATE_FILE"
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
  local headers="$ROOT_DIR/.headers-$host-$$"
  local body="$ROOT_DIR/.body-$host-$$"
  local status
  status="$(curl --silent --show-error --max-time 45 \
    --resolve "$host:443:127.0.0.1" \
    --dump-header "$headers" --output "$body" --write-out '%{http_code}' \
    "https://$host/api/readyz")"
  tr -d '\r' < "$headers" | grep -qi '^strict-transport-security:'
  rm -f "$headers" "$body"
  printf '%s' "$status"
}

for attempt in $(seq 1 18); do
  if probe_redirect "$PRODUCTION_HOST" && probe_redirect "$STAGING_HOST"; then
    production_status="$(probe_https "$PRODUCTION_HOST" || true)"
    staging_status="$(probe_https "$STAGING_HOST" || true)"
    if [ -n "$production_status" ] && [ -n "$staging_status" ]; then break; fi
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
