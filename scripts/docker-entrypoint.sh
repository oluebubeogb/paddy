#!/bin/sh
set -e

echo "[paddy] Applying database schema..."
if [ -n "$DATABASE_URL" ]; then
  # Prefer local CLI; never let npx pull a random major version
  if [ -x ./node_modules/.bin/prisma ]; then
    ./node_modules/.bin/prisma db push --skip-generate || {
      echo "[paddy] prisma db push failed — app will still start; fix DB manually"
    }
  else
    echo "[paddy] prisma CLI not found in image; skipping db push"
  fi
else
  echo "[paddy] DATABASE_URL not set; skipping db push"
fi

echo "[paddy] Starting app..."
exec "$@"
