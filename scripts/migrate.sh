#!/bin/sh
# Apply Prisma migrations. Prints the real error so Coolify logs are useful.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "migrate: DATABASE_URL is not set" >&2
  exit 1
fi

# Redact password for the log line
safe=$(printf '%s' "$DATABASE_URL" | sed -E 's#://([^:/]+):([^@]+)@#://\1:***@#')
echo "migrate: deploying against $safe"

i=0
until node_modules/.bin/prisma migrate deploy; do
  status=$?
  i=$((i + 1))
  if [ "$i" -ge 5 ]; then
    echo "migrate: failed after $i attempts (exit $status)" >&2
    node_modules/.bin/prisma migrate status || true
    exit "$status"
  fi
  echo "migrate: attempt $i failed (exit $status); retrying in 3s…" >&2
  sleep 3
done

echo "migrate: ok"
