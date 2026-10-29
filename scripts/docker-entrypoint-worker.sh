#!/bin/sh
set -e

echo "[paddy-worker] Ensuring database schema..."
if [ -n "$DATABASE_URL" ] && [ -x ./node_modules/.bin/prisma ]; then
  ./node_modules/.bin/prisma db push --skip-generate || \
    echo "[paddy-worker] db push failed; continuing"
fi

echo "[paddy-worker] Starting worker..."
exec "$@"
