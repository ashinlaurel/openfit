#!/usr/bin/env bash
# Run on the prepared VM with the repo's cloud directory at /opt/openfit/cloud.
# Usage: sudo bash cloud/deploy-stack.sh gym.example.com api.example.com
set -euo pipefail
if [[ $(id -u) != 0 ]]; then echo 'Run as root.' >&2; exit 1; fi
cd "$(dirname "$0")"
gym_host=${1:?Supply the public Open Gym hostname}
openfit_host=${2:?Supply the public OpenFit API hostname}
for hostname in "$gym_host" "$openfit_host"; do
  if [[ ! $hostname =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ || $hostname != *.* ]]; then
    echo 'Supply DNS hostnames without a scheme, path, or port.' >&2; exit 1
  fi
done
umask 077
install -d -m 700 ../secrets ../backups
install -d -m 700 -o 1000 -g 1000 ../data
for dir in gym openfit caddy caddy-config; do
  install -d -m 700 -o 1000 -g 1000 "../data/$dir"
done

# Never replace an existing deployment's origins, encryption key, or image pins.
if [[ ! -f .env ]]; then
  gym_image=$(docker image inspect ghcr.io/duartesantos8/opengym-api:latest --format '{{index .RepoDigests 0}}')
  web_image=$(docker image inspect ghcr.io/duartesantos8/opengym-web:latest --format '{{index .RepoDigests 0}}')
  proxy_image=$(docker image inspect caddy:2-alpine --format '{{index .RepoDigests 0}}')
  storage_key=$(openssl rand -hex 32)
  printf 'GYM_HOST=%s\nOPENFIT_HOST=%s\nGYM_API_IMAGE=%s\nGYM_WEB_IMAGE=%s\nCADDY_IMAGE=%s\nSTORAGE_KEY=%s\n' \
    "$gym_host" "$openfit_host" "$gym_image" "$web_image" "$proxy_image" "$storage_key" > .env
fi

# A one-use invite protects the first admin signup before the site goes public.
# Generate it only for a completely new database, while the API is not running.
if [[ ! -f ../data/gym/db.json ]]; then
  python3 - <<'PY'
import datetime, json, os, pathlib, secrets
code = secrets.token_hex(16).upper()
invite = {"code": code, "note": "Owner bootstrap", "createdBy": "bootstrap", "created": datetime.datetime.now(datetime.timezone.utc).isoformat()}
target = pathlib.Path('../data/gym/db.json')
with target.open('x') as out:
    json.dump({"users": [], "creds": [], "subs": [], "invites": [invite]}, out)
os.chmod(target, 0o600)
os.chown(target, 1000, 1000)
pathlib.Path('../secrets/owner-invite').write_text(code + '\n')
PY
fi

docker compose -f opengym-compose.yaml config --quiet
docker compose -f opengym-compose.yaml build openfit-cloud
docker compose -f opengym-compose.yaml run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile
docker compose -f opengym-compose.yaml up -d
docker compose -f opengym-compose.yaml ps
printf 'Owner signup invite is stored in /opt/openfit/secrets/owner-invite (root-only).\n'
