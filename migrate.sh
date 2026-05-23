#!/usr/bin/env bash
set -euo pipefail

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL must be set (add it to .env.local)}"

npm run db:migrate
