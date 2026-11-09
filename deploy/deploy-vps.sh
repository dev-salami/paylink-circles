#!/usr/bin/env bash
# Redeploy Circles to your own host. Env stays on the host (mode 600); data in a Docker volume.
# Usage: deploy/deploy-vps.sh <ssh-host>
# Example env path on the host: /opt/circles/secrets.env
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
HOST="${1:-}"
if [[ -z "$HOST" ]]; then
  echo "Usage: deploy/deploy-vps.sh <ssh-host>" >&2
  exit 1
fi
REV="$(git rev-parse --short HEAD)"
DIR="/opt/circles/releases/$REV"
ssh "$HOST" "test -f /opt/circles/secrets.env || { echo 'missing /opt/circles/secrets.env' >&2; exit 1; }"
git archive --format=tar HEAD | ssh "$HOST" "rm -rf $DIR && mkdir -p $DIR && tar -x -C $DIR"
ssh "$HOST" "cd $DIR/deploy && CIRCLES_REVISION=$REV docker compose -f compose.yaml up -d --build && ln -sfn $DIR /opt/circles/current"
echo "Deployed $REV"
