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

if [ ! -d .git ]; then
  echo "Deployment directory is not a git repository: $APP_DIR" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env file: $APP_DIR/$ENV_FILE" >&2
  exit 1
fi

git fetch --depth=1 origin "$RELEASE_SHA"
git checkout --force "$RELEASE_SHA"

mkdir -p deploy/data/logs

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

curl --fail --silent --show-error "$HEALTH_URL" >/tmp/project-management-health.json
cat /tmp/project-management-health.json
