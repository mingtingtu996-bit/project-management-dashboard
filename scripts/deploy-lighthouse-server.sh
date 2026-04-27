#!/usr/bin/env bash
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.lighthouse.yml}"
ENV_FILE="${ENV_FILE:-deploy/env/server.production.env}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1/api/health}"

case "$APP_DIR" in
  "~") APP_DIR="$HOME" ;;
  "~/"*) APP_DIR="$HOME/${APP_DIR#"~/"}" ;;
esac

cd "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env file: $APP_DIR/$ENV_FILE" >&2
  exit 1
fi

if [ -d .git ]; then
  tracked_changes="$(git status --porcelain --untracked-files=no)"
  if [ -n "$tracked_changes" ] && [ "${ALLOW_DIRTY_DEPLOY:-}" != "1" ]; then
    echo "Deployment directory has tracked local changes. Refusing to overwrite them." >&2
    echo "$tracked_changes" >&2
    echo "Clean or back up the server working tree, or set ALLOW_DIRTY_DEPLOY=1 intentionally." >&2
    exit 1
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

if [ -n "${RELEASE_ARCHIVE:-}" ]; then
  if [ ! -f "$RELEASE_ARCHIVE" ]; then
    echo "Missing release archive: $RELEASE_ARCHIVE" >&2
    exit 1
  fi

  echo "Deploying release archive for $RELEASE_SHA"
  if [ -d .git ]; then
    git ls-files -z | xargs -0 -r rm -f --
  fi
  tar -xzf "$RELEASE_ARCHIVE" -C "$APP_DIR"
  rm -f "$RELEASE_ARCHIVE"
elif [ -d .git ]; then
  retry 5 10 git fetch --depth=1 origin "$RELEASE_SHA"
  git checkout --force "$RELEASE_SHA"
else
  echo "Deployment directory is not a git repository and no release archive was provided: $APP_DIR" >&2
  exit 1
fi

mkdir -p deploy/data/logs

run_docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
run_docker_compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

curl --fail --silent --show-error "$HEALTH_URL" >/tmp/project-management-health.json
cat /tmp/project-management-health.json
