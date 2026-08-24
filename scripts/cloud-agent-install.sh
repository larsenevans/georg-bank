#!/usr/bin/env bash
# Idempotent Cloud Agent install — Node deps, Playwright Chromium, Postgres packages.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium

if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi

if [[ ! -f .env.local ]]; then
  cat > .env.local <<'EOF'
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/internet_bank"
BETTER_AUTH_URL="http://localhost:3030"
BETTER_AUTH_SECRET="local_testing_secret_key_987654321"
GUEST_USER_EMAIL="admin@local.test"
GUEST_USER_PASSWORD="admin1234"
APP_PIN="666666"
SITE_GATE_ENABLED="false"
SITE_GATE_PASSWORD="heslo"
NEXT_PUBLIC_DEV_USER_EMAIL="admin@local.test"
NEXT_PUBLIC_DEV_USER_PASSWORD="admin1234"
EOF
fi

echo "[cloud-agent-install] done"
