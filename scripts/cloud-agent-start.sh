#!/usr/bin/env bash
# Per-boot: deps if missing, .env.local, Postgres online, schema/guest seed.
set -euo pipefail

cd "$(dirname "$0")/.."

# Heal missing deps when a snapshot/boot skips install.
if [[ ! -d node_modules/next ]]; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
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

if command -v pg_lsclusters >/dev/null 2>&1; then
  if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    sudo service postgresql start 2>/dev/null || sudo pg_ctlcluster 16 main start 2>/dev/null || true
  fi
fi

for _ in $(seq 1 20); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if command -v psql >/dev/null 2>&1; then
  sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" >/dev/null 2>&1 || true
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='internet_bank'" | grep -q 1 \
    || sudo -u postgres createdb internet_bank
fi

npx tsx --env-file=.env.local scripts/ensure-db.ts || true

echo "[cloud-agent-start] ready"
