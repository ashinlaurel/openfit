#!/usr/bin/env bash
set -euo pipefail
stage=${1:?Supply staged release directory}
cd /opt/openfit
stamp=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 backups
# Existing archive storage and its key are preserved before changing the proxy.
tar -czf "backups/pre-web-${stamp}.tgz" cloud/.env cloud/Caddyfile data/openfit data/gym
install -d -m 700 -o 1000 -g 1000 data/web
install -d cloud/web electron dist
cp -R "$stage/cloud/web/." cloud/web/
cp "$stage/cloud/web-compose.yaml" cloud/web-compose.yaml
cp "$stage/electron/"*.cjs electron/
cp -R "$stage/dist/." dist/
install -m 600 "$stage/openfit-web-config.env" cloud/web.env
cd cloud
docker compose -f opengym-compose.yaml -f web-compose.yaml config --quiet
docker compose -f opengym-compose.yaml -f web-compose.yaml build openfit-web
docker compose -f opengym-compose.yaml -f web-compose.yaml up -d --no-deps openfit-web
# The proxy is changed only after the web container serves a health response.
for attempt in $(seq 1 30); do
  if docker compose -f opengym-compose.yaml -f web-compose.yaml exec -T openfit-web node -e 'fetch("http://127.0.0.1:3200/healthz").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'; then break; fi
  if [[ $attempt == 30 ]]; then echo 'Web service did not become healthy; proxy unchanged.' >&2; exit 1; fi
  sleep 2
done
cp Caddyfile "Caddyfile.pre-web-${stamp}"
cp "$stage/cloud/Caddyfile" Caddyfile
if ! docker compose -f opengym-compose.yaml exec -T proxy caddy validate --config /etc/caddy/Caddyfile; then
  cp "Caddyfile.pre-web-${stamp}" Caddyfile
  exit 1
fi
docker compose -f opengym-compose.yaml restart proxy
docker compose -f opengym-compose.yaml -f web-compose.yaml ps
